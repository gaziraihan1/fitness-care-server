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
    const db = client.db("gym");
    const usersCollection = db.collection("users");
    const trainersCollection = db.collection("trainerApplications");
    const classesCollection = db.collection("classes");
    const paymentsCollection = db.collection("payments");
    const forumsCollection = db.collection("forums");
    const slotsCollection = db.collection("slots");
    const bookingsCollection = db.collection("bookings");
    const reviewsCollection = db.collection("reviews");
    const newsletterCollection = db.collection("newsletters");

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

    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const user = await usersCollection.findOne({ email });

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.post("/jwt", (req, res) => {
      const user = req.body;
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
      try {
        const payment = req.body;

        const result = await paymentsCollection.insertOne(payment);
        const updateClass = await classesCollection.updateOne(
          { _id: new ObjectId(payment.classId) },
          { $inc: { bookings: 1 } }
        );

        await slotsCollection.updateOne(
          { _id: new ObjectId(payment.slotId) },
          {
            $set: {
              status: "booked",
              bookedBy: {
                name: payment.userName,
                email: payment.userEmail,
              },
            },
          }
        );

        res.send({ success: true, result, updateClass });
      } catch (err) {
        console.error("Payment Error:", err);
        res
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    });

    app.get("/featured-classes", async (req, res) => {
      try {
        const topClasses = await classesCollection
          .find({})
          .sort({ bookings: -1 })
          .limit(6)
          .toArray();

        res.send(topClasses);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch featured classes" });
      }
    });

    app.get("/admin/balance", verifyJWT, verifyAdmin, async (req, res) => {
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

    app.get("/newsletter/count", async (req, res) => {
      try {
        const count = await newsletterCollection.estimatedDocumentCount();
        res.send({ count });
      } catch (err) {
        console.error("Failed to fetch newsletter count:", err);
        res.status(500).send({ message: "Failed to fetch subscriber count" });
      }
    });

    app.get("/newsletter", async (req, res) => {
      try {
        const subscribers = await newsletterCollection
          .find()
          .sort({ date: -1 })
          .toArray();
        res.send(subscribers);
      } catch (err) {
        console.error("Failed to fetch subscribers", err);
        res.status(500).send({ message: "Failed to fetch subscribers" });
      }
    });

    app.post("/newsletter", async (req, res) => {
      const { name, email } = req.body;
      if (!name || !email) {
        return res.status(400).send({ message: "Name and email are required" });
      }

      try {
        const existing = await newsletterCollection.findOne({ email });
        if (existing) {
          return res.status(409).send({ message: "Email already subscribed" });
        }

        await newsletterCollection.insertOne({ name, email, date: new Date() });
        res.send({ message: "Subscribed successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to subscribe" });
      }
    });

    app.get("/payments/count", async (req, res) => {
      try {
        const count = await paymentsCollection.countDocuments();
        res.send({ count });
      } catch (err) {
        console.error("Error fetching payments count:", err);
        res.status(500).send({ message: "Failed to fetch payments count" });
      }
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/reviews", verifyJWT, async (req, res) => {
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

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden: Email mismatch" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) return res.status(404).send({ message: "User not found" });

      res.send({ role: user.role });
    });

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

      const userResult = await usersCollection.updateOne(
        { email },
        { $set: { role: "member" } }
      );

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

    app.get("/forum/latest", async (req, res) => {
      try {
        const forums = await forumsCollection
          .find(
            {},
            {
              projection: {
                title: 1,
                content: 1,
                author: 1,
                email: 1,
                role: 1,
                createdAt: 1,
                upvotes: 1,
                downvotes: 1,
              },
            }
          )
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        res.status(200).send(forums);
      } catch (error) {
        console.error("❌ Error fetching latest forum posts:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/forum/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const post = await forumsCollection.findOne(
          { _id: new ObjectId(id) },
          {
            projection: {
              title: 1,
              content: 1,
              author: 1,
              email: 1,
              role: 1,
              createdAt: 1,
              upvotes: 1,
              downvotes: 1,
            },
          }
        );
        if (!post) {
          return res.status(404).send({ message: "Post not found" });
        }
        res.send(post);
      } catch (error) {
        console.error("❌ Error fetching forum post details:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
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

    app.patch("/forum/vote/:id", async (req, res) => {
      const id = req.params.id;
      const { email, voteType } = req.body;

      const forum = await forumsCollection.findOne({ _id: new ObjectId(id) });
      if (!forum) return res.status(404).send({ message: "Post not found" });

      const existingVote = forum.voters?.find((v) => v.email === email);

      let updateQuery = {};
      let updateOptions = {};

      if (!existingVote) {
        updateQuery = {
          $inc: {
            upvotes: voteType === "up" ? 1 : 0,
            downvotes: voteType === "down" ? 1 : 0,
          },
          $push: { voters: { email, voteType } },
        };
      } else if (existingVote.voteType !== voteType) {
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
        return res.send({ message: "Already voted" });
      }

      await forumsCollection.updateOne(
        { _id: new ObjectId(id) },
        updateQuery,
        updateOptions
      );
      res.send({ message: "Vote updated successfully" });
    });

    app.post("/forum", async (req, res) => {
      const data = req.body;
      const result = await forumsCollection.insertOne(data);
      res.send(result);
    });

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
        className: { $regex: search, $options: "i" },
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

    app.get("/slots/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const slot = await slotsCollection.findOne({ _id: new ObjectId(id) });

        if (!slot) {
          return res.status(404).send({ error: "Slot not found" });
        }

        if (slot.classId) {
          const classInfo = await classesCollection.findOne({
            _id: new ObjectId(slot.classId),
          });
          slot.className = classInfo?.className || "Unknown Class";
        }

        res.send(slot);
      } catch (error) {
        console.error("Error fetching slot:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.delete("/slots/:id", async (req, res) => {
      const id = req.params.id;
      const result = await slotsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post("/slots", async (req, res) => {
      const { trainerEmail, slotName, slotTime, days, classId, notes } =
        req.body;

      try {
        const slotRes = await slotsCollection.insertOne({
          trainerEmail,
          slotName,
          slotTime,
          days,
          classId,
          notes,
          createdAt: new Date(),
        });

        const trainer = await trainersCollection.findOne({
          email: trainerEmail,
        });
        if (trainer) {
          const trainerDetails = {
            trainerId: trainer._id.toString(),
            name: trainer.fullName,
            image: trainer.profileImage,
            role: "trainer",
          };

          await classesCollection.updateOne(
            { _id: new ObjectId(classId) },
            {
              $addToSet: { trainers: trainerDetails },
            }
          );
        }

        res.send({ insertedId: slotRes.insertedId });
      } catch (error) {
        console.error("Error adding slot:", error);
        res.status(500).send({ message: "Failed to add slot" });
      }
    });

    app.delete("/trainers/:id", async (req, res) => {
      const trainerId = req.params.id;

      try {
        await trainerApplicationsCollection.deleteOne({
          _id: new ObjectId(trainerId),
        });

        await classesCollection.updateMany(
          {},
          {
            $pull: {
              trainers: { trainerId },
            },
          }
        );

        res.send({ message: "Trainer deleted and removed from classes." });
      } catch (err) {
        console.error("Error deleting trainer:", err);
        res.status(500).send({ message: "Failed to delete trainer" });
      }
    });

    app.get("/trainers/:id", async (req, res) => {
      const id = req.params.id;
      const result = await trainersCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

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

    app.patch("/trainerApplications/confirm/:id", async (req, res) => {
      const id = req.params.id;
      const result = await trainersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "trainer", status: "confirmed" } }
      );
      res.send(result);
    });

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

    app.get(
      "/trainerApplications",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const trainers = await trainersCollection.find().toArray();
        res.send(trainers);
      }
    );

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
  } finally {
  }
};

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
