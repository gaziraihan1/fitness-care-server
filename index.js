require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const stripe = require("stripe")(process.env.SECRET_KEY_STRIPE);
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
    const slotsCollection = db.collection("slots");
    const bookingsCollection = db.collection("bookings");
    const reviewsCollection = db.collection("reviews");
    
    const verifyJWT = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized" });
      }
      const token = authHeader.split(" ")[1];
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "Forbidden" });
        }
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

    app.get("/bookings/:userEmail", verifyJWT, async (req, res) => {
      const userEmail = req.params.userEmail;
      if (req.user.email !== userEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await bookingsCollection.find({ userEmail }).toArray();
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      booking.createdAt = new Date();

      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const paymentData = req.body;
      const result = await paymentsCollection.insertOne(paymentData);

      await trainersCollection.updateOne(
        { _id: new ObjectId(paymentData.trainerId) },
        { $inc: { bookingCount: 1 } }
      );

      if (paymentData.classId) {
    await classesCollection.updateOne(
      { _id: new ObjectId(paymentData.classId) },
      { $inc: { bookingCount: 1 } }
    );
  }

      res.send(result);
    });

app.get("/featured-classes", async (req, res) => {
  try {
    const topClasses = await classesCollection
      .find({})
      .sort({ bookingCount: -1 })
      .limit(6)
      .toArray();

    res.send(topClasses);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch featured classes" });
  }
});


    app.get("/admin/balance", async (req, res) => {
      try {
        const payments = await paymentsCollection
          .find({})
          .sort({ date: -1 })
          .toArray();

        const totalBalance = payments.reduce(
          (sum, payment) => sum + payment.price,
          0
        );
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

    // Count newsletter subscribers
app.get("/subscribers/count", async (req, res) => {
  const count = await db.collection("subscribers").countDocuments();
  res.send({ count });
});

// Count total paid members (i.e., unique users who made a payment)
app.get("/payments/count", async (req, res) => {
  const count = await paymentsCollection.distinct("userEmail");
  res.send({ count: count.length });
});


app.get("/reviews", async (req, res) => {
  const result = await reviewsCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(result);
});


    app.post('/reviews', verifyJWT, async (req, res) => {
  const review = req.body;
  const result = await reviewsCollection.insertOne(review);
  res.send(result);
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

    app.get("/forum", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;

      const total = await forumsCollection.countDocuments();
      const forums = await forumsCollection
        .find()
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();

      res.send({ forums, total });
    });

    // PATCH vote for a forum post
    app.patch("/forum/vote/:id", async (req, res) => {
      const id = req.params.id;
      const { email, voteType } = req.body; // voteType = 'up' or 'down'

      const forum = await forumsCollection.findOne({ _id: new ObjectId(id) });
      if (!forum) return res.status(404).send({ message: "Post not found" });

      const existingVote = forum.voters?.find((v) => v.email === email);

      let updateQuery = {};
      let updateOptions = {};

      if (!existingVote) {
        // First time voting
        updateQuery = {
          $inc: {
            upvotes: voteType === "up" ? 1 : 0,
            downvotes: voteType === "down" ? 1 : 0,
          },
          $push: { voters: { email, voteType } },
        };
      } else if (existingVote.voteType !== voteType) {
        // Changing vote
        updateQuery = {
          $inc: {
            upvotes: voteType === "up" ? 1 : -1,
            downvotes: voteType === "down" ? 1 : -1,
          },
          $set: {
            "voters.$[elem].voteType": voteType,
          },
        };
        updateOptions = {
          arrayFilters: [{ "elem.email": email }],
        };
      } else {
        // Already voted the same
        return res.send({ message: "Already voted" });
      }

      await forumsCollection.updateOne(
        { _id: new ObjectId(id) },
        updateQuery,
        updateOptions
      );
      res.send({ message: "Vote updated successfully" });
    });

    // POST a forum post
    app.post("/forum", async (req, res) => {
      const data = req.body;
      const result = await forumsCollection.insertOne(data);
      res.send(result);
    });

    // Get a trainer by ID

    app.get("/class/:id/trainers", async (req, res) => {
      try {
        const classId = req.params.id;
        const classDoc = await classesCollection.findOne({
          _id: new ObjectId(classId),
        });

        if (!classDoc)
          return res.status(404).send({ error: "Class not found" });

        if (!classDoc.trainerIds || classDoc.trainerIds.length === 0)
          return res.send([]);

        const trainers = await trainersCollection
          .find({
            _id: { $in: classDoc.trainerIds.slice(0, 5) },
            status: "approved",
          })
          .toArray();

        res.send(trainers);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Server error" });
      }
    });

    app.get("/classes", verifyJWT, async (req, res) => {
      const classes = await classesCollection.find().toArray();
      res.send(classes);
    });

    app.get("/allClasses", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 6;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";

  const query = {
    className: { $regex: search, $options: "i" }, // Case-insensitive partial match
  };

  const total = await classesCollection.countDocuments(query);
  const classes = await classesCollection
    .find(query)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .toArray();

  res.send({ total, classes });
});


    app.post("/classes", async (req, res) => {
      try {
        const { className, image, details, otherInfo } = req.body;

        if (!className || !image || !details) {
          return res.status(400).send({ error: "Missing required fields" });
        }

        const newClass = {
          className,
          image,
          details,
          otherInfo: otherInfo || "",
          trainerIds: [],
          createdAt: new Date(),
        };

        const result = await classesCollection.insertOne(newClass);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to create class" });
      }
    });

    app.get("/slots", async (req, res) => {
      const email = req.query.email;
      try {
        const query = email ? { trainerEmail: email } : {};
        const slots = await slotsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(slots);
      } catch (error) {
        res
          .status(500)
          .send({ success: false, error: "Failed to fetch slots" });
      }
    });

    app.delete("/slots/:id", async (req, res) => {
      const id = req.params.id;
      const result = await slotsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post("/slots", async (req, res) => {
      const slotData = req.body;

      try {
        const result = await slotsCollection.insertOne({
          ...slotData,
          createdAt: new Date(),
          status: "active",
        });

        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, error: "Failed to create slot" });
      }
    });

    app.get("/trainers/:id", async (req, res) => {
      const id = req.params.id;
      const result = await trainersCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // GET /trainerApplications/user/:email
    app.get("/trainerApplications/user/:email", async (req, res) => {
      const email = req.params.email;
      const applications = await trainersCollection.find({ email }).toArray();
      res.send(applications);
    });

    app.get("/trainerApplications/:email", async (req, res) => {
      const email = req.params.email;
      const trainer = await trainersCollection.findOne({ email });

      if (!trainer) {
        return res
          .status(404)
          .send({ message: "Trainer application not found" });
      }

      res.send(trainer);
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
    

    app.get("/trainerApplications", async (req, res) => {
      const trainers = await trainersCollection.find().toArray();
      res.send(trainers);
    });
    // Get all confirmed trainers
    app.get("/trainers", verifyJWT, async (req, res) => {
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
