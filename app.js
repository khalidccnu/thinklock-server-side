require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const multer = require("multer");
const imageKit = require("imagekit");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SK);
const morgan = require("morgan");

const app = express();
const port = process.env.PORT || 5000;
const uploadMulter = multer();

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

const imagekit = new imageKit({
  publicKey: process.env.IK_PL_KEY,
  privateKey: process.env.IK_PV_KEY,
  urlEndpoint: `https://ik.imagekit.io/` + process.env.IK_ID,
});

const uploadToIK = async (req, res) => {
  let fieldName = req.file.fieldname.replace("Img", "");

  switch (fieldName) {
    case "user":
      fieldName = "users";
      break;
    case "course":
      fieldName = "courses";
      break;
    default:
      fieldName = "";
  }

  imagekit
    .upload({
      file: req.file.buffer,
      fileName: req.file.originalname,
      folder: `thinklock/${fieldName}`,
    })
    .then((response) => res.send(response))
    .catch((error) => res.send(error));
};

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
    const bookedCourses = mdbClient.db("thinklock").collection("bookedCourses");
    const orders = mdbClient.db("thinklock").collection("orders");

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

    const verifyStudent = async (req, res, next) => {
      const query = { _id: req.decoded._id };
      const result = await users.findOne(query);

      if (result.role !== "student") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access!" });
      }

      next();
    };

    const verifySelf = async (req, res, next) => {
      if (req.decoded._id !== req.params.identifier)
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access!" });

      next();
    };

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const cursor = users.find();
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/users/:identifier", verifyJWT, verifySelf, async (req, res) => {
      const query = { _id: req.params.identifier };
      const result = await users.findOne(query);

      res.send(result);
    });

    app.put("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const query = { _id: req.params.id };
      const result = await users.updateOne(query, { $set: req.body });

      res.send(result);
    });

    app.get("/instructors", async (req, res) => {
      const options = {
        projection: { email: 1, name: 1, photo: 1 },
      };

      const query = { role: "instructor" };
      const cursor = users.find(query, options);
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/instructors/:id", async (req, res) => {
      const options = {
        projection: { email: 1, name: 1, photo: 1 },
      };

      const query = { _id: req.params.id, role: "instructor" };
      const result = await users.findOne(query, options);

      res.send(result);
    });

    app.get(
      "/admin/instructors/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const query = { _id: req.params.id, role: "instructor" };
        const result = await users.findOne(query);

        res.send(result);
      }
    );

    app.get("/courses", async (req, res) => {
      const options = {
        projection: {
          instructor_id: 1,
          name: 1,
          seat: 1,
          purchase: 1,
          price: 1,
          image: 1,
        },
      };

      const query = { status: "approved" };
      const cursor = courses.find(query, options);
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/admin/courses", verifyJWT, verifyAdmin, async (req, res) => {
      const cursor = courses.find();
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get(
      "/instructor/:identifier/courses",
      verifyJWT,
      verifyInstructor,
      verifySelf,
      async (req, res) => {
        const query = { instructor_id: req.params.identifier };
        const cursor = courses.find(query);
        const result = await cursor.toArray();

        res.send(result);
      }
    );

    app.get("/courses/popular", async (req, res) => {
      const options = {
        projection: {
          instructor_id: 1,
          name: 1,
          seat: 1,
          purchase: 1,
          price: 1,
          image: 1,
        },
        sort: {
          purchase: -1,
        },
        limit: 6,
      };

      const query = {
        status: "approved",
        $expr: { $ne: ["$seat", "$purchase"] },
      };
      const cursor = courses.find(query, options);
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get(
      "/instructor/:identifier/courses/:id",
      verifyJWT,
      verifyInstructor,
      verifySelf,
      async (req, res) => {
        const query = {
          instructor_id: req.params.identifier,
          _id: new ObjectId(req.params.id),
        };
        const result = await courses.findOne(query);

        res.send(result);
      }
    );

    app.get(
      "/student/:identifier/booked-courses",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        const query = { student_id: req.params.identifier };
        const result = await bookedCourses.findOne(query);

        res.send(result);
      }
    );

    app.get(
      "/student/:identifier/booked-courses/paid-balance",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        let paidBalance;
        const bcResult = await bookedCourses.findOne({
          student_id: req.params.identifier,
        });

        if (bcResult) {
          const ids = bcResult.courses.map((id) => new ObjectId(id));
          const options = {
            projection: { price: 1 },
          };

          const query = { _id: { $in: ids } };
          const cursor = courses.find(query, options);
          const result = await cursor.toArray();

          paidBalance = result.reduce(
            (total, current) => total + current.price,
            0
          );
        } else {
          paidBalance = 0;
        }

        res.send({ paidBalance: Math.ceil(paidBalance) });
      }
    );

    app.get(
      "/student/:identifier/orders",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        const query = { ct_key: req.params.identifier };
        const cursor = orders.find(query).sort({ date: -1 });
        const result = await cursor.toArray();

        res.send(result);
      }
    );

    app.post("/users/upload-ui", uploadMulter.single("userImg"), uploadToIK);

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { _id: user._id };
      const exist = await users.findOne(query);

      if (exist)
        return res.send({ error: true, message: "User already exist!" });

      const result = await users.insertOne(user);

      res.send(result);
    });

    app.post(
      "/new-course/upload-ci",
      verifyJWT,
      verifyInstructor,
      uploadMulter.single("courseImg"),
      uploadToIK
    );

    app.post("/new-course", verifyJWT, verifyInstructor, async (req, res) => {
      const result = await courses.insertOne(req.body);

      res.send(result);
    });

    app.post(
      "/student/:identifier/booked-courses",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        if (Array.isArray(req.body)) {
          const ids = req.body.map((id) => new ObjectId(id));
          const options = {
            projection: {
              instructor_id: 1,
              name: 1,
              seat: 1,
              price: 1,
              image: 1,
            },
          };

          const query = { _id: { $in: ids } };
          const cursor = courses.find(query, options);
          const result = await cursor.toArray();

          res.send(result);
        } else {
          res.send([]);
        }
      }
    );

    app.post(
      "/student/:identifier/enrolled-courses",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        if (Array.isArray(req.body)) {
          const ids = req.body.map((id) => new ObjectId(id));
          const options = {
            projection: {
              instructor_id: 1,
              name: 1,
              seat: 1,
              purchase: 1,
              price: 1,
              image: 1,
            },
          };

          const query = { _id: { $in: ids } };
          const cursor = courses.find(query, options);
          const result = await cursor.toArray();

          res.send(result);
        } else {
          res.send([]);
        }
      }
    );

    app.post(
      "/create-payment-intent",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        const amount = req.body.paidBalance * 100;

        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send(paymentIntent.client_secret);
      }
    );

    app.post(
      "/student/:identifier/orders",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        const query = { student_id: req.params.identifier };
        const bcResult = await bookedCourses.findOne(query);

        const order = {
          ...req.body,
          courses: bcResult.courses,
        };

        const result = await orders.insertOne(order);

        res.send(result);
      }
    );

    app.put(
      "/student/:identifier/courses",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        const ids = req.body.map((id) => new ObjectId(id));

        const csQuery = { _id: { $in: ids } };
        const usQuery = { _id: req.params.identifier };

        await courses.updateMany(csQuery, { $inc: { purchase: 1 } });
        await users.updateOne(usQuery, {
          $pull: { courses: { $in: req.body } },
        });
        await users.updateOne(usQuery, {
          $push: { courses: { $each: req.body } },
        });

        res.status(200).send({ success: true, message: "OK!" });
      }
    );

    app.put(
      "/instructor/:identifier/courses/:id",
      verifyJWT,
      verifyInstructor,
      verifySelf,
      async (req, res) => {
        const query = {
          instructor_id: req.params.identifier,
          _id: new ObjectId(req.params.id),
        };
        const result = await courses.updateOne(query, {
          $set: req.body,
        });

        res.send(result);
      }
    );

    app.put("/admin/courses/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const options = { upsert: true };
      const query = { _id: new ObjectId(req.params.id) };
      const result = await courses.updateOne(
        query,
        { $set: req.body },
        options
      );

      res.send(result);
    });

    app.put(
      "/student/:identifier/booked-courses",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        const options = { upsert: true };
        const query = { student_id: req.params.identifier };
        const result = await bookedCourses.updateOne(
          query,
          { $set: req.body },
          options
        );

        res.send(result);
      }
    );

    app.delete(
      "/student/:identifier/booked-courses",
      verifyJWT,
      verifyStudent,
      verifySelf,
      async (req, res) => {
        const query = { student_id: req.params.identifier };
        const result = await bookedCourses.deleteOne(query);

        res.send(result);
      }
    );

    mdbClient
      .db("admin")
      .command({ ping: 1 })
      .then((_) => console.log("Successfully connected to MongoDB!"));
  } catch (err) {
    console.log("Did not connect to MongoDB! " + err.message);
  } finally {
    // await mdbClient.close();
  }
})();

app.get("/", (req, res) => {
  res.send("ThinkLock is running...");
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
