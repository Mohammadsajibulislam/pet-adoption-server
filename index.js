const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");

    const db = client.db("petAdoption");
    const petsCollection = db.collection("pets");
    const requestsCollection = db.collection("requests");

    // ──────────────────────────────────────
    // PETS ROUTES
    // ──────────────────────────────────────

    // GET all pets (with search & filter)
    app.get("/pets", async (req, res) => {
      try {
        const { search, species } = req.query;
        let query = {};

        if (search) {
          query.name = { $regex: search, $options: "i" };
        }

        if (species && species !== "all") {
          query.species = { $in: [species] };
        }

        const result = await petsCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET featured pets (only 6)
    app.get("/pets/featured", async (req, res) => {
      try {
        const result = await petsCollection.find().limit(6).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET single pet
    app.get("/pets/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await petsCollection.findOne({ _id: new ObjectId(id) });
        if (!result) return res.status(404).json({ message: "Pet not found" });
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // POST add pet
    app.post("/pets", async (req, res) => {
      try {
        const petData = req.body;
        petData.status = "available";
        petData.createdAt = new Date();
        const result = await petsCollection.insertOne(petData);
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // PATCH update pet
    app.patch("/pets/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;
        const result = await petsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // DELETE pet
    app.delete("/pets/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await petsCollection.deleteOne({ _id: new ObjectId(id) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ──────────────────────────────────────
    // REQUESTS ROUTES
    // ──────────────────────────────────────

    // GET requests by userId
    app.get("/requests/user/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const result = await requestsCollection
          .find({ userId })
          .toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET requests by petId (owner দেখবে)
    app.get("/requests/pet/:petId", async (req, res) => {
      try {
        const { petId } = req.params;
        const result = await requestsCollection
          .find({ petId })
          .toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // POST submit adoption request
    app.post("/requests", async (req, res) => {
      try {
        const requestData = req.body;
        requestData.status = "pending";
        requestData.createdAt = new Date();
        const result = await requestsCollection.insertOne(requestData);
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // PATCH approve request → mark pet as adopted
    app.patch("/requests/:id/approve", async (req, res) => {
      try {
        const { id } = req.params;
        const { petId } = req.body;

        // এই request approve করো
        await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "approved" } }
        );

        // বাকি সব request reject করো
        await requestsCollection.updateMany(
          { petId, _id: { $ne: new ObjectId(id) } },
          { $set: { status: "rejected" } }
        );

        // Pet কে adopted mark করো
        await petsCollection.updateOne(
          { _id: new ObjectId(petId) },
          { $set: { status: "adopted" } }
        );

        res.json({ message: "Request approved successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // PATCH reject request
    app.patch("/requests/:id/reject", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // DELETE cancel request
    app.delete("/requests/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await requestsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Pet Adoption Server is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});