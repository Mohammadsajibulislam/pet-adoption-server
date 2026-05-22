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
// VALIDATION & HELPER FUNCTIONS
// ──────────────────────────────────────

// Validate ObjectId
const isValidObjectId = (id) => {
  try {
    return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
  } catch (error) {
    return false;
  }
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate pet data
const validatePetData = (data) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
    errors.push("Pet name is required and must be a non-empty string");
  }
  if (!data.species || typeof data.species !== "string") {
    errors.push("Species is required");
  }
  if (!data.breed || typeof data.breed !== "string") {
    errors.push("Breed is required");
  }
  if (data.age === undefined || data.age === null || data.age === "") {
    errors.push("Age is required");
  }
  if (!data.gender || typeof data.gender !== "string") {
    errors.push("Gender is required");
  }
  if (!data.image || typeof data.image !== "string") {
    errors.push("Image URL is required");
  }
  if (!data.ownerEmail || !isValidEmail(data.ownerEmail)) {
    errors.push("Valid owner email is required");
  }
  if (data.adoptionFee === undefined || data.adoptionFee === null) {
    errors.push("Adoption fee is required");
  }
  return errors;
};

// Validate adoption request data
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

// GET all pets (search & filter)
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
    res.status(500).json({ 
      message: "Failed to fetch pets", 
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET featured pets
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
    res.status(500).json({ 
      message: "Failed to fetch featured pets",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET pets by owner email
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
    res.status(500).json({ 
      message: "Failed to fetch pets",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET single pet
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
    res.status(500).json({ 
      message: "Failed to fetch pet details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// POST add pet
app.post("/pets", async (req, res) => {
  try {
    const petData = req.body;
    
    // Validate input
    // const validationErrors = validatePetData(petData);
    // if (validationErrors.length > 0) {
    //   return res.status(400).json({ 
    //     message: "Validation error",
    //     errors: validationErrors 
    //   });
    // }

    petData.status = "available";
    petData.createdAt = new Date();
    petData.updatedAt = new Date();
    
    const result = await petsCollection.insertOne(petData);
    res.status(201).json({ 
      message: "Pet added successfully",
      id: result.insertedId 
    });
  } catch (error) {
    console.error("Error adding pet:", error);
    res.status(500).json({ 
      message: "Failed to add pet",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// PATCH update pet
app.patch("/pets/:id",async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid pet ID format" });
    }

    // Don't allow changing status or ownership
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
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error("Error updating pet:", error);
    res.status(500).json({ 
      message: "Failed to update pet",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// DELETE pet
app.delete("/pets/:id",async (req, res) => {
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
    res.status(500).json({ 
      message: "Failed to delete pet",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// ──────────────────────────────────────
// REQUESTS ROUTES
// ──────────────────────────────────────

// GET requests by userId
app.get("/requests/user/:userId", async (req, res) => {
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
    res.status(500).json({ 
      message: "Failed to fetch requests",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET requests by petId
app.get("/requests/pet/:petId",async (req, res) => {
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
    res.status(500).json({ 
      message: "Failed to fetch requests",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// POST submit request
app.post("/requests",async (req, res) => {
  try {
    const requestData = req.body;

    // Validate inputz
    const validationErrors = validateRequestData(requestData);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: "Validation error",
        errors: validationErrors 
      });
    }

    // Check if pet exists
    const petExists = await petsCollection.findOne({
      _id: new ObjectId(requestData.petId),
    });
    if (!petExists) {
      return res.status(404).json({ message: "Pet not found" });
    }

    // Check if already requested by this user
    const existingRequest = await requestsCollection.findOne({
      petId: requestData.petId,
      userId: requestData.userId,
      status: { $in: ["pending", "approved"] },
    });
    if (existingRequest) {
      return res.status(409).json({ 
        message: "You have already requested this pet" 
      });
    }

    requestData.status = "pending";
    requestData.createdAt = new Date();
    requestData.updatedAt = new Date();

    const result = await requestsCollection.insertOne(requestData);
    res.status(201).json({ 
      message: "Adoption request submitted successfully",
      id: result.insertedId 
    });
  } catch (error) {
    console.error("Error submitting request:", error);
    res.status(500).json({ 
      message: "Failed to submit adoption request",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// PATCH approve request
app.patch("/requests/:id/approve",async (req, res) => {
  try {
    const { id } = req.params;
    const { petId } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid request ID format" });
    }
    if (!isValidObjectId(petId)) {
      return res.status(400).json({ message: "Invalid pet ID format" });
    }

    // Check if request exists
    const requestExists = await requestsCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!requestExists) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Update the approved request
    await requestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved", updatedAt: new Date() } }
    );

    // Reject other requests for the same pet
    await requestsCollection.updateMany(
      { petId, _id: { $ne: new ObjectId(id) } },
      { $set: { status: "rejected", updatedAt: new Date() } }
    );

    // Mark pet as adopted
    await petsCollection.updateOne(
      { _id: new ObjectId(petId) },
      { $set: { status: "adopted", updatedAt: new Date() } }
    );

    res.json({ message: "Adoption request approved successfully" });
  } catch (error) {
    console.error("Error approving request:", error);
    res.status(500).json({ 
      message: "Failed to approve request",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// PATCH reject request
app.patch("/requests/:id/reject",async (req, res) => {
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
    res.status(500).json({ 
      message: "Failed to reject request",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// DELETE cancel request
app.delete("/requests/:id",async (req, res) => {
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
    res.status(500).json({ 
      message: "Failed to cancel request",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// Root route
app.get("/", (req, res) => {
  res.send("Pet Adoption Server is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});