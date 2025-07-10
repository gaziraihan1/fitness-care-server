require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.MONGO_NAME}:${process.env.MONGO_PASS}@cluster-1.atolsgl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster-1`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
res.send('hello world')
})

const run = async () => {
  try {
    await client.connect();

    const db = client.db("gym");
    const usersCollection = db.collection("users");
    const trainersCollection = db.collection("trainerApplications");

    const verifyJWT = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).send({ message: "Unauthorized" });
      const token = authHeader.split(" ")[1];
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).send({ message: "Forbidden" });

        req.user = decoded;
        next();
      });
    };

    app.post("/jwt", (req, res) => {
      const user = req.body; // expects { email }
      if (!user.email) {
        return res.status(400).send({ message: "Email is required" });
      }
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });

      res.send({ token });
    });

    app.get('/users', async (req, res) => {
  const role = req.query.role;
  const result = await usersCollection.find({ role }).toArray();
  res.send(result);
});


    app.get("/users/role/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      // Block access if token's email and param email don't match
      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden: Email mismatch" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) return res.status(404).send({ message: "User not found" });

      res.send({ role: user.role }); // 'admin', 'trainer', or 'member'
    });

    // Promote user role
app.patch("/users/promote/:email", async (req, res) => {
  const email = req.params.email;
  const { role } = req.body;
  const result = await usersCollection.updateOne(
    { email },
    { $set: { role } }
  );
  res.send(result);
});


    app.post("/users", async (req, res) => {
      const user = req.body;

      const result = await usersCollection.insertOne(user);
      res
        .status(201)
        .send({ message: "User created", insertedId: result.insertedId });
    });

    app.get("/trainerApplications", async (req, res) => {
      const result = await trainersCollection.find().toArray();
      res.send(result);
    });

    // PATCH: Confirm trainer (change role)
    app.patch("/trainerApplications/confirm/:id", async (req, res) => {
      const id = req.params.id;
      const result = await trainersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "trainer" } }
      );
      res.send(result);
    });

    // PATCH: Reject trainer with feedback
    app.patch("/trainerApplications/reject/:id", async (req, res) => {
      const id = req.params.id;
      const { feedback } = req.body;

      const result = await trainersCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: "rejected",
            feedback: feedback || "",
          },
        }
      );

      res.send(result);
    });

    app.post("/trainerApplications", verifyJWT, async (req, res) => {
      const trainer = req.body;
      const result = await trainersCollection.insertOne(trainer);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
};

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
