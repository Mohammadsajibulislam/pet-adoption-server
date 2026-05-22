const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

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
// JWT MIDDLEWARE
// ──────────────────────────────────────

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    console.error("Token verify error:", error.message);
    return res.status(403).json({ message: "Forbidden" });
  }
};

// ──────────────────────────────────────
// VALIDATION & HELPER FUNCTIONS
// ──────────────────────────────────────

const isValidObjectId = (id) => {
  try {
    return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
  } catch (error) {
    return false;
  }
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateRequestData = (data) => {
  const errors = [];
  if (!data.petId || !isValidObjectId(data.petId)) {
    errors.push("Valid pet ID is required");
  }
  if (!data.userName || typeof data.userName !== "string") {
    errors.push("User name is required");
  }
  if (!data.userEmail || !isValidEmail(data.userEmail)) {
    errors.push("Valid user email is required");
  }
  if (!data.pickupDate || typeof data.pickupDate !== "string") {
    errors.push("Pickup date is required");
  }
  if (!data.userId || typeof data.userId !== "string") {
    errors.push("User ID is required");
  }
  return errors;
};

// ──────────────────────────────────────
// PETS ROUTES
// ──────────────────────────────────────

// GET all pets (search & filter) — public
app.get("/pets", async (req, res) => {
  try {
    const { search, species } = req.query;
    let query = {};
    if (search && typeof search === "string") {
      query.name = { $regex: search, $options: "i" };
    }
    if (species && species !== "all" && typeof species === "string") {
      query.species = { $in: [species] };
    }
    const result = await petsCollection.find(query).toArray();
    res.json(result);
  } catch (error) {
    console.error("Error fetching pets:", error);
    res.status(500).json({ message: "Failed to fetch pets" });
  }
});

// GET featured pets — public
app.get("/pets/featured", async (req, res) => {
  try {
    const result = await petsCollection
      .find()
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.json(result);
  } catch (error) {
    console.error("Error fetching featured pets:", error);
    res.status(500).json({ message: "Failed to fetch featured pets" });
  }
});

// GET pets by owner email — public
app.get("/pets/owner/:email", async (req, res) => {
  try {
    const { email } = req.params;
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    const result = await petsCollection
      .find({ ownerEmail: email })
      .toArray();
    res.json(result);
  } catch (error) {
    console.error("Error fetching owner pets:", error);
    res.status(500).json({ message: "Failed to fetch pets" });
  }
});

// GET single pet — public
app.get("/pets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid pet ID format" });
    }
    const result = await petsCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!result) {
      return res.status(404).json({ message: "Pet not found" });
    }
    res.json(result);
  } catch (error) {
    console.error("Error fetching pet:", error);
    res.status(500).json({ message: "Failed to fetch pet details" });
  }
});

// POST add pet — protected
app.post("/pets", verifyToken, async (req, res) => {
  try {
    const petData = req.body;
    petData.status = "available";
    petData.createdAt = new Date();
    petData.updatedAt = new Date();
    const result = await petsCollection.insertOne(petData);
    res.status(201).json({
      message: "Pet added successfully",
      id: result.insertedId,
    });
  } catch (error) {
    console.error("Error adding pet:", error);
    res.status(500).json({ message: "Failed to add pet" });
  }
});

// PATCH update pet — protected
app.patch("/pets/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid pet ID format" });
    }
    delete updatedData.status;
    delete updatedData.ownerEmail;
    delete updatedData.createdAt;
    updatedData.updatedAt = new Date();
    const result = await petsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Pet not found" });
    }
    res.json({
      message: "Pet updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating pet:", error);
    res.status(500).json({ message: "Failed to update pet" });
  }
});

// DELETE pet — protected
app.delete("/pets/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid pet ID format" });
    }
    const result = await petsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Pet not found" });
    }
    res.json({ message: "Pet deleted successfully" });
  } catch (error) {
    console.error("Error deleting pet:", error);
    res.status(500).json({ message: "Failed to delete pet" });
  }
});

// ──────────────────────────────────────
// REQUESTS ROUTES
// ──────────────────────────────────────

// GET requests by userId — protected
app.get("/requests/user/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ message: "Valid user ID is required" });
    }
    const result = await requestsCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(result);
  } catch (error) {
    console.error("Error fetching user requests:", error);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

// GET requests by petId — protected
app.get("/requests/pet/:petId", verifyToken, async (req, res) => {
  try {
    const { petId } = req.params;
    if (!isValidObjectId(petId)) {
      return res.status(400).json({ message: "Invalid pet ID format" });
    }
    const result = await requestsCollection
      .find({ petId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(result);
  } catch (error) {
    console.error("Error fetching pet requests:", error);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

// POST submit request — protected
app.post("/requests", verifyToken, async (req, res) => {
  try {
    const requestData = req.body;

    const validationErrors = validateRequestData(requestData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Validation error",
        errors: validationErrors,
      });
    }

    const petExists = await petsCollection.findOne({
      _id: new ObjectId(requestData.petId),
    });
    if (!petExists) {
      return res.status(404).json({ message: "Pet not found" });
    }

    const existingRequest = await requestsCollection.findOne({
      petId: requestData.petId,
      userId: requestData.userId,
      status: { $in: ["pending", "approved"] },
    });
    if (existingRequest) {
      return res.status(409).json({
        message: "You have already requested this pet",
      });
    }

    requestData.status = "pending";
    requestData.createdAt = new Date();
    requestData.updatedAt = new Date();

    const result = await requestsCollection.insertOne(requestData);
    res.status(201).json({
      message: "Adoption request submitted successfully",
      id: result.insertedId,
    });
  } catch (error) {
    console.error("Error submitting request:", error);
    res.status(500).json({ message: "Failed to submit adoption request" });
  }
});

// PATCH approve request — protected
app.patch("/requests/:id/approve", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { petId } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid request ID format" });
    }
    if (!isValidObjectId(petId)) {
      return res.status(400).json({ message: "Invalid pet ID format" });
    }

    const requestExists = await requestsCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!requestExists) {
      return res.status(404).json({ message: "Request not found" });
    }

    await requestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved", updatedAt: new Date() } }
    );

    await requestsCollection.updateMany(
      { petId, _id: { $ne: new ObjectId(id) } },
      { $set: { status: "rejected", updatedAt: new Date() } }
    );

    await petsCollection.updateOne(
      { _id: new ObjectId(petId) },
      { $set: { status: "adopted", updatedAt: new Date() } }
    );

    res.json({ message: "Adoption request approved successfully" });
  } catch (error) {
    console.error("Error approving request:", error);
    res.status(500).json({ message: "Failed to approve request" });
  }
});

// PATCH reject request — protected
app.patch("/requests/:id/reject", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid request ID format" });
    }
    const result = await requestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "rejected", updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Request not found" });
    }
    res.json({ message: "Adoption request rejected successfully" });
  } catch (error) {
    console.error("Error rejecting request:", error);
    res.status(500).json({ message: "Failed to reject request" });
  }
});

// DELETE cancel request — protected
app.delete("/requests/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid request ID format" });
    }
    const result = await requestsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Request not found" });
    }
    res.json({ message: "Adoption request cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling request:", error);
    res.status(500).json({ message: "Failed to cancel request" });
  }
});

// Root route
app.get("/", (req, res) => {
  res.send("Pet Adoption Server is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});