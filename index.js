const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://pet-adoption-client-seven.vercel.app",
    ],
    credentials: true,
  })
);
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("petAdoption");
const petsCollection = db.collection("pets");
const requestsCollection = db.collection("requests");

client
  .connect()
  .then(() => {
    console.log("Connected to MongoDB!");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// ──────────────────────────────────────
// PETS ROUTES
// ──────────────────────────────────────

// GET all pets (search & filter)
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

// GET featured pets
app.get("/pets/featured", async (req, res) => {
  try {
    const result = await petsCollection.find().limit(6).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET pets by owner email
app.get("/pets/owner/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const result = await petsCollection
      .find({ ownerEmail: email })
      .toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET single pet
app.get("/pets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await petsCollection.findOne({
      _id: new ObjectId(id),
    });
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
    const result = await petsCollection.deleteOne({
      _id: new ObjectId(id),
    });
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

// GET requests by petId
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

// POST submit request
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

// PATCH approve request
app.patch("/requests/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { petId } = req.body;

    await requestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved" } }
    );

    await requestsCollection.updateMany(
      { petId, _id: { $ne: new ObjectId(id) } },
      { $set: { status: "rejected" } }
    );

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

// Root route
app.get("/", (req, res) => {
  res.send("Pet Adoption Server is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});