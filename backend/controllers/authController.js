const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userModel = require("../models/userModel");
const SECRET = process.env.JWT_SECRET;

exports.register = async (req, res) => {
    const { username, email, number, password } = req.body;

    const profilePicture = req.file
        ? `/uploads/${req.file.filename}`
        : null;

        if (!username || !number || !password) {
            return res.status(400).json({
                message: "All fields required"
            });
        }

    try {

        const existingUser = await userModel.getUserByPhone(number);

        if (existingUser) {
            return res.status(400).json({ message: "User with this phone number already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await userModel.createUser(
            username,
            email,
            number,
            hashedPassword,
            profilePicture
        );

        res.json({ message: "User registered successfully", user});

    } catch (error) {
        res.status(500).json({ message: "Error registering user", error: error.message});
    }
};

exports.login = async (req, res) => {
    const { number, password } = req.body;

    try {
        const user = await userModel.getUserByPhone(number);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.Password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid password" });
        }

        const token = jwt.sign({ id: user.Id }, SECRET, { expiresIn: "7d" });

        res.json({ message: "Login successful", token, userId: user.Id});

    } catch (error) {
        res.status(500).json({ message: "Error Logging in", error: error.message});
    }
};

exports.updateProfilePicture = async (req, res) => {
    try {
        const userId = req.user.id;
    
        const profilePicture = req.file
            ? `/uploads/${req.file.filename}`
            : null;
    
        await userModel.updateProfilePicture(userId, profilePicture)
    
        res.json({ message: "Profile updated", profilePicture: updated.profilePicture
         })
        
    } catch (error) {
        res.status(500).json({ message: "Error updating profile picture" });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { username, about } = req.body;

        const updatedUser = await userModel.updateProfile(userId, username, about);

        if (!updatedUser) {
            return res.status(400).json({ message: "update failed" });
        }

        res.json({ message: "Profile updated", user: updatedUser });

    } catch (error) {
        res.status(500).json({ message: "Error updating profile" })
    }
};

exports.getMe = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const userId = req.user.id;

        const user = await userModel.getUserById(currentUserId, userId);

        if (user?.profilePicture && !user.profilePicture.startsWith("http")){
            user.profilePicture = `http://localhost:5000${user.ProfilePicture}`;
        }

        res.json(user);

    } catch (error) {
        res.status(500).json({ message: "Error While Fetching User" });
    }
};

exports.removeProfilePicture = async (req, res) => {
    try {
        const userId = req.user.id;
        
        await userModel.removeProfilePicture(userId);

        res.json({ 
            message: "Profile picture removed successfully",
            ProfilePicture: null
         });


    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Error removing profile picture"
        });
    }
};