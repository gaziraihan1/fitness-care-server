require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const stripe = require("stripe")("sk_test_your_secret_key_here");
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
  res.send("hello world");
});

const run = async () => {
  try {
    await client.connect();

    const db = client.db("gym");
    const usersCollection = db.collection("users");
    const trainersCollection = db.collection("trainerApplications");
    const classesCollection = db.collection("classes");
    const paymentsCollection = db.collection("payments");
    const forumsCollection = db.collection("forums");

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

    app.post("/create-payment-intent", async (req, res) => {
  const { price } = req.body;
  const amount = parseInt(price * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    payment_method_types: ["card"],
  });

  res.send({ clientSecret: paymentIntent.client_secret });
});

app.post("/bookings", async (req, res) => {
  const booking = req.body;
  booking.createdAt = new Date();

  const result = await db.collection("bookings").insertOne(booking);
  res.send(result);
});


app.post("/payments", async (req, res) => {
  const paymentData = req.body;
  const result = await paymentsCollection.insertOne(paymentData);

  await trainersCollection.updateOne(
    { _id: new ObjectId(paymentData.trainerId) },
    { $inc: { bookingCount: 1 } }
  );

  res.send(result);
});

// GET admin balance and recent transactions
app.get("/admin/balance", async (req, res) => {
  try {

    const payments = await paymentsCollection
      .find({})
      .sort({ date: -1 })
      .toArray();

    const totalBalance = payments.reduce((sum, payment) => sum + payment.price, 0);
    const recentTransactions = payments.slice(0, 6);

    res.send({
      totalBalance,
      recentTransactions,
    });
  } catch (error) {
    console.error("Error fetching admin balance", error);
    res.status(500).send({ message: "Server error" });
  }
});


    app.post("/jwt", (req, res) => {
      const user = req.body; // expects { email }
      if (!user.email) {
        return res.status(400).send({ message: "Email is required" });
      }
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });

      res.send({ token });
    });

    app.get("/users", async (req, res) => {
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

    app.patch("/users/downgrade/:email", async (req, res) => {
      const email = req.params.email;

      // 1. Downgrade role in usersCollection
      const userResult = await usersCollection.updateOne(
        { email },
        { $set: { role: "member" } }
      );

      // 2. Delete from trainerApplications
      const trainerResult = await trainersCollection.deleteOne({ email });

      res.send({
        modifiedUser: userResult.modifiedCount,
        deletedTrainer: trainerResult.deletedCount,
      });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const result = await usersCollection.insertOne(user);
      res
        .status(201)
        .send({ message: "User created", insertedId: result.insertedId });
    });


    // POST a forum post
app.post("/forum", async (req, res) => {
  const data = req.body;
  const result = await forumCollection.insertOne(data);
  res.send(result);
});


    

    // Get a trainer by ID
    app.get("/trainers/:id", async (req, res) => {
      const id = req.params.id;
      const result = await trainersCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // PATCH: Confirm trainer (change role)
    app.patch("/trainerApplications/confirm/:id", async (req, res) => {
      const id = req.params.id;
      const result = await trainersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "trainer", status: "confirmed" } }
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

    app.post("/classes", async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });
    
    app.get("/trainerApplications/:id", async (req, res) => {
  const { id } = req.params;
  const result = await trainersCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});


    app.get("/trainerApplications", async (req, res) => {
      const trainers = await trainersCollection
        .find()
        .toArray();
      res.send(trainers);
    });
    // Get all confirmed trainers
    app.get("/trainers", async (req, res) => {
      const trainers = await trainersCollection
        .find({ status: "confirmed" })
        .toArray();
      res.send(trainers);
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
