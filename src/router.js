const express = require("express");
const mysql = require("mysql");
const router = express.Router();
const con = require("./db");
const middleware = require("./middleware/users");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { request } = require("express");

router.get("/", (req, res) => {
  res.send("Server is running.");
});

// register user request
router.post("/register", middleware.validateRegistration, (req, res) => {
  const email = req.body.email.toLowerCase();
  con.query(
    `SELECT * FROM users WHERE email = ${mysql.escape(email)}`,
    (err, result) => {
      if (err) {
        res.status(400).json({ msg: "The DB is broken." });
      } else if (result.length !== 0) {
        res.status(400).json({ msg: "The user email already exists" });
      } else {
        bcrypt.hash(req.body.password, 10, (err, hash) => {
          if (err) {
            res.status(400).json(err);
          } else {
            con.query(
              `INSERT INTO users (email, password, user_type) VALUES (${mysql.escape(
                email
              )}, ${mysql.escape(hash)}, 'admin')`,
              (err, result) => {
                if (err) {
                  res.status(400).json(err);
                } else {
                  res
                    .status(201)
                    .json({ msg: "USER has registered succesfully." });
                }
              }
            );
          }
        });
      }
    }
  );
});

// user login request
router.post("/login", (req, res) => {
  const email = req.body.email ? req.body.email.toLowerCase() : "";
  con.query(
    `SELECT * FROM users WHERE email = ${mysql.escape(email)}`,
    (err, result) => {
      if (err || result.length === 0) {
        err
          ? res.status(400).json({ msg: "Problem with DB." })
          : res.status(400).json({ msg: "No such user." });
      } else {
        bcrypt.compare(
          req.body.password,
          result[0].password,
          (bErr, bResult) => {
            if (bErr || !bResult) {
              res.status(400).json({ msg: "The user password is not correct" });
            } else {
              if (bResult) {
                const token = jwt.sign(
                  {
                    userId: result[0].id,
                    email: result[0].email,
                    user_type: result[0].user_type,
                  },
                  process.env.SECRET_KEY,
                  { expiresIn: "7d" }
                );
                res.status(200).json({ msg: "Logged In", token });
              }
            }
          }
        );
      }
    }
  );
});

// public get showtimes
router.get("/showtimes", (req, res) => {
  let now = new Date().toISOString().slice(0, 10);
  con.query(
    `SELECT showtimes_test.id AS show_id, showtimes_test.time, showtimes_test.date, movies_test.*, rooms_test.seats, tickets.tickets FROM showtimes_test 
  INNER JOIN movies_test ON showtimes_test.movie_id = movies_test.id
  LEFT JOIN (SELECT id, row_count * row_seats AS seats FROM rooms_test) AS rooms_test ON showtimes_test.room_id = rooms_test.id
  LEFT JOIN (SELECT event_id, COUNT(id) AS tickets FROM tickets_test GROUP BY event_id ) as tickets ON showtimes_test.id = tickets.event_id
  WHERE showtimes_test.date = '${now}' ORDER BY showtimes_test.time ASC`,
    (err, result) => {
      if (err) {
        console.log(err);
        res.json([]);
      } else {
        res.json(result);
      }
    }
  );
});

// function GenSeats will be needed to respond user with data for Seats Layout
function GenSeats(rows, row_seats) {
  let allseats = [];
  let currentNumber = 0;
  for (let i = 1; i < rows + 1; i++) {
    let seats = [];
    for (let x = 1; x < row_seats + 1; x++) {
      currentNumber += 1;
      seats.push(currentNumber);
    }
    allseats.push(seats);
  }
  return allseats;
}

// user get showtime by id, seatsdata, ticketsdata
router.get("/showtimes/:id", middleware.isLoggedIn, (req, res) => {
  if (req.params.id) {
    con.query(
      `SELECT showtimes_test.*, movies_test.title, movies_test.poster_img, rooms_test.row_count, rooms_test.row_seats
    FROM showtimes_test
    LEFT JOIN movies_test ON showtimes_test.movie_id = movies_test.id
    LEFT JOIN rooms_test ON showtimes_test.room_id = rooms_test.id
    WHERE showtimes_test.id = ${mysql.escape(req.params.id)}`,
      (err, result) => {
        if (err || result.length === 0) {
          err
            ? res.status(400).json(err)
            : res.status(400).json({ msg: "Error in founding this ID." });
        } else {
          let res_data = { showtime: [], seats: [], tickets: [] };
          let temp_seats = GenSeats(result[0].row_count, result[0].row_seats);
          res_data.showtime = result;
          res_data.seats = temp_seats;
          con.query(
            `SELECT id, ticket_seat FROM tickets_test WHERE event_id = ${mysql.escape(
              req.params.id
            )}`,
            (err, results) => {
              if (err) {
                res.status(400).json(err);
              } else {
                res_data.tickets = results;
                res.json(res_data);
              }
            }
          );
        }
      }
    );
  } else {
    res.status(400).json({ msg: "ID was missed in request." });
  }
});

// user post tickets to write to db
router.post("/tickets", middleware.isLoggedIn, (req, res) => {
  if (
    req.body.event_id &&
    req.body.ticket_price &&
    req.body.event_time &&
    req.body.event_date &&
    req.body.movie_title &&
    req.body.ticket_seat.length !== 0 &&
    req.body.ticket_seat.length < 5 &&
    req.userData.userId
  ) {
    con.query(
      `SELECT ticket_seat FROM tickets_test WHERE event_id = ${req.body.event_id}`,
      (err, result) => {
        if (err) {
          res.status(400).json(err);
        } else {
          // check if there are no already booked seats with the same seat number
          let duplicates = req.body.ticket_seat.filter(
            (item) => item === result.map((items) => items)
          );
          // process to insertion of ticket seat to db
          let error_status = [];
          if (duplicates.length === 0) {
            for (let i = 0; i < Number(req.body.ticket_seat.length); i++) {
              console.log("vyksta for loops");
              con.query(
                `INSERT INTO tickets_test (user_id, event_id, ticket_price, ticket_seat, event_date, event_time, movie_title) VALUES(${mysql.escape(
                  req.userData.userId
                )}, ${mysql.escape(req.body.event_id)}, ${mysql.escape(
                  req.body.ticket_price
                )}, ${mysql.escape(req.body.ticket_seat[i])}, ${mysql.escape(
                  req.body.event_date
                )}, ${mysql.escape(req.body.event_time)}, ${mysql.escape(
                  req.body.movie_title
                )})`,
                (err, result) => {
                  if (err) {
                    console.log(err);
                    error_status.push(i);
                  } else {
                    if (i === Number(req.body.ticket_seat.length) - 1) {
                      error_status.length > 0
                        ? res.status(400).json({
                            msg: "Some of your seats could not be booked, please contact administrator.",
                          })
                        : res.status(200).json({ msg: "Your seats booked." });
                    }
                  }
                }
              );
            }
          } else {
            res
              .status(400)
              .json({ msg: "Found duplicated seats. Booking canceled." });
          }
        }
      }
    );
  }
});

// user get tickets request
router.get("/tickets", middleware.isLoggedIn, (req, res) => {
  con.query(
    `SELECT * FROM tickets_test WHERE user_id = ${mysql.escape(
      req.userData.userId
    )}`,
    (err, result) => {
      if (err || result.length === 0) {
        err
          ? res.status(400).json(err)
          : res.status(400).json({ msg: "No tickets found in database." });
      } else {
        res.status(200).json(result);
      }
    }
  );
});

// user/admin delete ticket request
router.delete("/tickets/delete/:id", middleware.isLoggedIn, (req, res) => {
  if (req.params.id) {
    con.query(
      `SELECT * FROM tickets_test WHERE id = ${mysql.escape(req.params.id)}`,
      (err, result) => {
        if (err || result.length === 0) {
          err
            ? res.status(400).json(err)
            : res
                .status(400)
                .json({ msg: "No such ticket found in database." });
        } else {
          let date_now = new Date().toLocaleDateString("LT-lt");
          let date_ticket = new Date(result[0].event_date).toLocaleDateString(
            "LT-lt"
          );

          if (
            result[0].user_id === req.userData.userId &&
            date_ticket > date_now
          ) {
            con.query(
              `DELETE FROM tickets_test WHERE id = '${result[0].id}'`,
              (err, results) => {
                if (err || results.affectedRows === 0) {
                  err
                    ? res.status(400).json(err)
                    : res
                        .status(400)
                        .json({ msg: "Could not delete requested ticket." });
                } else {
                  res.status(200).json(results);
                }
              }
            );
          } else if (req.userData.user_type === "admin") {
            con.query(
              `DELETE FROM tickets_test WHERE id = '${result[0].id}'`,
              (err, results) => {
                if (err || results.affectedRows === 0) {
                  err
                    ? res.status(400).json(err)
                    : res
                        .status(400)
                        .json({ msg: "Could not delete requested ticket." });
                } else {
                  res.status(200).json(results);
                }
              }
            );
          } else {
            res.status(400).json({ msg: "You do not have required rights." });
          }
        }
      }
    );
  } else {
    res.status(400).json({ msg: "No ticket ID given." });
  }
});

// admin get movies
router.get("/movies", middleware.isLoggedIn, (req, res) => {
  if (req.userData.user_type === "admin") {
    con.query(`SELECT * FROM movies_test`, (err, result) => {
      if (err) {
        res.status(400).json(err);
      } else {
        res.status(200).json(result);
      }
    });
  }
});

// admin delete movie by id request
router.delete("/movies/delete/:id", middleware.isLoggedIn, (req, res) => {
  if (req.params.id && req.userData.user_type === "admin") {
    con.query(
      `DELETE FROM movies_test WHERE id = ${mysql.escape(req.params.id)}`,
      (err, result) => {
        if (err) {
          res.status(400).json(err);
        } else {
          res.status(200).json(result);
        }
      }
    );
  } else {
    res.status(400).json({ msg: "You do not have rights to delete." });
  }
});

// admin add movie post
router.post("/movies/add", middleware.isLoggedIn, (req, res) => {
  if (
    req.body &&
    req.userData.user_type === "admin" &&
    req.body.movie_length > 0 &&
    req.body.movie_length < 180 &&
    req.body.title &&
    req.body.title.trim() !== ""
  ) {
    con.query(
      `INSERT INTO movies_test (title, cover_img, poster_img, description, director, genre, movie_length, year) VALUES(${mysql.escape(
        req.body.title
      )}, ${mysql.escape(req.body.cover_img)}, ${mysql.escape(
        req.body.poster_img
      )}, ${mysql.escape(req.body.description)}, ${mysql.escape(
        req.body.director
      )}, ${mysql.escape(req.body.genre)}, ${mysql.escape(
        req.body.movie_length
      )}, ${mysql.escape(req.body.year)})`,
      (err, result) => {
        if (err) {
          res
            .status(400)
            .json({ msg: "Could not add to database because internal error." });
        } else {
          res.status(200).json(result);
        }
      }
    );
  } else {
    res.status(400).json({
      msg: "You do not have rights or fields are not filled properly.",
    });
  }
});

// admin get movie by id request
router.get("/movies/:id", middleware.isLoggedIn, (req, res) => {
  if (req.params.id && req.userData.user_type === "admin") {
    con.query(
      `SELECT * FROM movies_test WHERE id = ${mysql.escape(req.params.id)}`,
      (err, result) => {
        if (err) {
          res.status(400).json(err);
        } else {
          res.status(200).json(result);
        }
      }
    );
  } else {
    res.status(400).json({ msg: "You do not have rights to delete." });
  }
});

// admin update movie post
router.post("/movies/update/:id", middleware.isLoggedIn, (req, res) => {
  if (
    req.body &&
    req.userData.user_type === "admin" &&
    req.body.movie_length > 0 &&
    req.body.movie_length < 180 &&
    req.body.title &&
    req.params.id
  ) {
    con.query(
      `UPDATE movies_test SET title=${mysql.escape(
        req.body.title
      )}, cover_img=${mysql.escape(
        req.body.cover_img
      )}, poster_img=${mysql.escape(
        req.body.poster_img
      )}, description=${mysql.escape(
        req.body.description
      )}, director=${mysql.escape(req.body.director)}, genre=${mysql.escape(
        req.body.genre
      )}, movie_length=${mysql.escape(
        req.body.movie_length
      )}, year=${mysql.escape(req.body.year)} WHERE id = ${mysql.escape(
        req.params.id
      )}`,
      (err, result) => {
        if (err) {
          console.log(err);
          res.status(400).json({
            msg: "Could not add edit database because internal error.",
          });
        } else {
          res.status(200).json(result);
        }
      }
    );
  } else {
    res.status(400).json({
      msg: "You do not have rights or fields are not filled properly.",
    });
  }
});

// admin get cinemas
router.get("/cinema", middleware.isLoggedIn, (req, res) => {
  if (req.userData.user_type === "admin") {
    con.query(`SELECT * FROM rooms_test`, (err, result) => {
      if (err) {
        res.status(400).json(err);
      } else {
        res.json(result);
      }
    });
  } else {
    res.status(400).json({ msg: "You do not have such rights." });
  }
});

// admin delete cinema by id
router.delete("/cinema/delete/:id", middleware.isLoggedIn, (req, res) => {
  if (req.userData.user_type === "admin" && req.params.id) {
    con.query(
      `DELETE FROM rooms_test WHERE id = ${mysql.escape(req.params.id)}`,
      (err, result) => {
        if (err) {
          res.status(400).json(err);
        } else {
          res.json(result);
        }
      }
    );
  } else {
    res
      .status(400)
      .json({ msg: "You do not have such rights or ID is not defined." });
  }
});

// admin add cinema
router.post("/cinema/add", middleware.isLoggedIn, (req, res) => {
  if (
    req.userData.user_type === "admin" &&
    req.body &&
    req.body.title &&
    req.body.title.trim() !== "" &&
    req.body.rows &&
    req.body.row_seats &&
    req.body.rows < 41 &&
    req.body.row_seats < 21
  ) {
    con.query(
      `INSERT INTO rooms_test (title, row_count, row_seats) VALUES(${mysql.escape(
        req.body.title
      )}, ${mysql.escape(req.body.rows)}, ${mysql.escape(req.body.row_seats)})`,
      (err, result) => {
        if (err) {
          res.status(400).json(err);
        } else {
          res.json(result);
        }
      }
    );
  } else {
    res.status(400).json({
      msg: "You do not have such rights or fields are not filled properly.",
    });
  }
});

// admin get all showtimes
router.get("/showtimes/get/all", middleware.isLoggedIn, (req, res) => {
  if (req.userData.user_type === "admin") {
    con.query(
      `SELECT showtimes_test.id AS show_id, showtimes_test.time, showtimes_test.date, movies_test.title, rooms_test.seats, rooms_test.room_title, tickets.tickets, showtimes_test.price FROM showtimes_test 
    LEFT JOIN movies_test ON showtimes_test.movie_id = movies_test.id
    LEFT JOIN (SELECT id, title as room_title, row_count * row_seats AS seats FROM rooms_test) AS rooms_test ON showtimes_test.room_id = rooms_test.id
    LEFT JOIN (SELECT event_id, COUNT(id) AS tickets FROM tickets_test GROUP BY event_id ) as tickets ON showtimes_test.id = tickets.event_id
    ORDER BY showtimes_test.date ASC`,
      (err, result) => {
        if (err) {
          res.status(400).json(err);
        } else {
          res.json(result);
        }
      }
    );
  } else {
    res.status(400).json({ msg: "You do not have rights." });
  }
});

// admin add showtime
router.post(
  "/showtime/add",
  middleware.isLoggedIn,
  middleware.validateShowtime,
  (req, res) => {
    if (req.userData.user_type === "admin") {
      let show_date = req.body.date;
      con.query(
        `INSERT INTO showtimes_test (time, date, room_id, movie_id, price) VALUES(${mysql.escape(
          req.body.time
        )}, ${mysql.escape(show_date)}, ${mysql.escape(
          req.body.cinema_id
        )}, ${mysql.escape(req.body.movie_id)}, ${mysql.escape(
          req.body.ticket_price
        )})`,
        (err, result) => {
          if (err) {
            res.status(400).json(err);
          } else {
            res.json(result);
          }
        }
      );
    } else {
      res.status(400).json({
        msg: "You do not have such rights or fields are not filled properly.",
      });
    }
  }
);

// admin delete showtime by id
router.delete("/showtime/delete/:id", middleware.isLoggedIn, (req, res) => {
  if (
    req.userData.user_type === "admin" &&
    req.params.id &&
    Number.isInteger(Number(req.params.id))
  ) {
    con.query(
      `SELECT * FROM tickets_test WHERE event_id = ${mysql.escape(
        req.params.id
      )}`,
      (err, result) => {
        if (err || result.length !== 0) {
          err
            ? res.status(400).json(err)
            : res
                .status(400)
                .json({ msg: "You cannot delete Showtime with user tickets." });
        } else {
          con.query(
            `DELETE FROM showtimes_test WHERE id = ${mysql.escape(
              req.params.id
            )}`,
            (err, result) => {
              if (err) {
                res.status(400).json(err);
              } else {
                res.json(result);
              }
            }
          );
        }
      }
    );
  } else {
    res
      .status(400)
      .json({ msg: "You do not have such rights or ID is not defined." });
  }
});

// admin get all tickets
router.get("/tickets/all", middleware.isLoggedIn, (req, res) => {
  if (req.userData.user_type === "admin") {
    con.query(`SELECT * FROM tickets_test`, (err, result) => {
      if (err) {
        res.status(400).json(err);
      } else {
        res.json(result);
      }
    });
  } else {
    res.status(400).json({ msg: "You do not have such rights." });
  }
});

module.exports = router;
