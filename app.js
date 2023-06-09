require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const imageKit = require("imagekit");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");

const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan("dev"));

const mdbClient = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access!" });
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .send({ error: true, message: "Forbidden access!" });
    }

    req.decoded = decoded;

    next();
  });
};

(async (_) => {
  try {
    const users = mdbClient.db("thinklock").collection("users");
    const courses = mdbClient.db("thinklock").collection("courses");

    const verifyAdmin = async (req, res, next) => {
      const query = { _id: req.decoded._id };
      const result = await users.findOne(query);

      if (result.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access!" });
      }

      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const query = { _id: req.decoded._id };
      const result = await users.findOne(query);

      if (result.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access!" });
      }

      next();
    };

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const cursor = users.find();
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/users/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      if (req.decoded._id !== id)
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access!" });

      const query = { _id: id };
      const result = await users.findOne(query);

      res.send(result);
    });

    app.get(
      "/:instructor/courses",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const id = req.params.instructor;

        if (req.decoded._id !== id)
          return res
            .status(403)
            .send({ error: true, message: "Forbidden access!" });

        const query = { instructor_id: id };
        const cursor = courses.find(query);
        const result = await cursor.toArray();

        res.send(result);
      }
    );

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { _id: user._id };
      const exist = await users.findOne(query);

      if (exist)
        return res.send({ error: true, message: "User already exist!" });

      const result = await users.insertOne(user);

      res.send(result);
    });

    app.post("/new-course", verifyJWT, verifyInstructor, async (req, res) => {
      const result = await courses.insertOne(req.body);

      res.send(result);
    });

    mdbClient
      .db("admin")
      .command({ ping: 1 })
      .then((_) => console.log("Successfully connected to MongoDB!"));
  } catch (err) {
    console.log("Did not connect to MongoDB! " + err.message);
  } finally {
    await mdbClient.close();
  }
})();

app.get("/", (req, res) => {
  res.send("ThinkLock is running...");
});

app.get("/ik", (req, res) => {
  const imagekit = new imageKit({
    publicKey: process.env.IK_PL_KEY,
    privateKey: process.env.IK_PV_KEY,
    urlEndpoint: `https://ik.imagekit.io/` + process.env.IK_ID,
  });

  const authenticationParameters = imagekit.getAuthenticationParameters();

  res.send(authenticationParameters);
});

app.post("/jwt", (req, res) => {
  const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });

  res.send(token);
});

app.listen(port, (_) => {
  console.log(`ThinkLock API is running on port: ${port}`);
});
