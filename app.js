require("dotenv").config();
const express = require("express");

const app = express();
const port = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("ThinkLock is running...");
});

app.listen(port, (_) => {
  console.log(`ThinkLock API is running on port: ${port}`);
});
