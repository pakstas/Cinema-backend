const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = {
  validateRegistration: (req, res, next) => {
    if (!req.body.email || req.body.email.length < 8) {
      return res.status(400).json({
        msg: "User email does not follow the rules",
      });
    }
    if (!req.body.password || req.body.password.length < 8) {
      return res.status(400).json({
        msg: "Password does not follow the rules",
      });
    }
    next();
  },
  validateShowtime: (req, res, next) => {
    const arr1 = [0, 1, 2];
    const arr2 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const arr3 = [0, 1, 2, 3, 4, 5];
    if (
      !req.body.time ||
      req.body.time.length !== 5 ||
      !arr1.includes(Number(req.body.time[0])) ||
      !arr2.includes(Number(req.body.time[1])) ||
      req.body.time[2] !== ":" ||
      !arr3.includes(Number(req.body.time[3])) ||
      !arr2.includes(Number(req.body.time[4])) ||
      Number(req.body.time.slice(0, 2)) < 0 ||
      Number(req.body.time.slice(0, 2)) > 24 ||
      Number(req.body.time.slice(3, 5)) < 0 ||
      Number(req.body.time.slice(3, 5)) > 59
    ) {
      return res.status(400).json({ msg: "Time does not follow the rules." });
    }
    if (
      !req.body.date ||
      new Date(req.body.date).toLocaleDateString("LT-lt") <
        new Date().toLocaleDateString("LT-lt")
    ) {
      return res.status(400).json({ msg: "Date does not follow the rules." });
    }
    if (
      !req.body.cinema_id ||
      req.body.cinema_id < 0 ||
      !Number.isInteger(req.body.cinema_id)
    ) {
      return res
        .status(400)
        .json({ msg: "Cinema ID does not follow the rules." });
    }
    if (
      !req.body.movie_id ||
      req.body.movie_id < 0 ||
      !Number.isInteger(req.body.movie_id)
    ) {
      return res
        .status(400)
        .json({ msg: "Movie ID does not follow the rules." });
    }
    if (
      !req.body.ticket_price ||
      req.body.ticket_price < 0 ||
      !Number.isInteger(req.body.ticket_price)
    ) {
      return res
        .status(400)
        .json({ msg: "Ticket Price does not follow the rules." });
    }

    next();
  },
  isLoggedIn: (req, res, next) => {
    try {
      const token = req.headers.authorization.split(" ")[1];
      const decodedToken = jwt.verify(token, process.env.SECRET_KEY);
      req.userData = decodedToken;
      next();
    } catch (err) {
      return res.status(401).send({ msg: "Your session is invalid" });
    }
  },
};
