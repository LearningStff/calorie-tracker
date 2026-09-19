require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

// password hashing and account tracking
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const port = 8080;


// EJS
app.set("view engine", "ejs");

// Public folder
app.use(express.static("public"));

// Allows us to access form data with req.body
app.use(express.urlencoded({ extended: true }));


// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));


// MongoDB
mongoose.connect(process.env.MONGO_CONNECTION_STRING)
    .then(() => {
        console.log("MongoDB connected");
    })
    .catch((error) => {
        console.log(error);
    });


// Food Schema
const foodschema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    food: {
        type: String,
        required: true
    },

    protein: {
        type: Number,
        required: true,
        min: 0
    },

    carbs: {
        type: Number,
        required: true,
        min: 0
    },

    fat: {
        type: Number,
        required: true,
        min: 0
    },

    calories: {
        type: Number,
        required: true,
        min: 0
    }

}, {
    timestamps: true
});

const Food = mongoose.model("Food", foodschema);


// Goal Schema
const goalSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    calorieGoal: {
        type: Number,
        required: true,
        min: 1
    },

    proteinGoal: {
        type: Number,
        required: true,
        min: 1
    },

    carbGoal: {
        type: Number,
        required: true,
        min: 1,
        default: 250
    },

    fatGoal: {
        type: Number,
        required: true,
        min: 1,
        default: 65
    }

});

const Goal = mongoose.model("Goal", goalSchema);


// User Schema
const userSchema = new mongoose.Schema({

    username: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },

    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    }

}, {
    timestamps: true
});

const User = mongoose.model("User", userSchema);


// Require Login Middleware
const requireLogin = (req, res, next) => {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    next();
};


// HOME
app.get("/", requireLogin, async (req, res) => {

    // Today's date
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);


    // 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);


    // Get today's foods
    const foods = await Food.find({

        userId: req.session.userId,

        createdAt: {
            $gte: startOfToday
        }

    });


    // Get last 7 days of foods
    const weeklyFoods = await Food.find({

        userId: req.session.userId,

        createdAt: {
            $gte: sevenDaysAgo
        }

    });


    // Count unique days tracked
    const trackedDays = new Set();

    for (let i = 0; i < weeklyFoods.length; i++) {

        const date =
            weeklyFoods[i].createdAt.toLocaleDateString();

        trackedDays.add(date);
    }

    const daysTracked = trackedDays.size;


    // Weekly totals
    let weeklyCalories = 0;
    let weeklyProtein = 0;

    for (let i = 0; i < weeklyFoods.length; i++) {

        weeklyCalories =
            weeklyCalories + Number(weeklyFoods[i].calories);

        weeklyProtein =
            weeklyProtein + Number(weeklyFoods[i].protein);
    }


    // Weekly averages
    let averageCalories = 0;
    let averageProtein = 0;

    if (daysTracked > 0) {

        averageCalories = Math.round(
            weeklyCalories / daysTracked
        );

        averageProtein = Math.round(
            weeklyProtein / daysTracked
        );
    }


    // Get daily totals for each day
    const dailyTotals = {};

    for (let i = 0; i < weeklyFoods.length; i++) {

        const date =
            weeklyFoods[i].createdAt.toLocaleDateString();

        if (!dailyTotals[date]) {

            dailyTotals[date] = {
                calories: 0,
                protein: 0
            };
        }

        dailyTotals[date].calories +=
            Number(weeklyFoods[i].calories);

        dailyTotals[date].protein +=
            Number(weeklyFoods[i].protein);
    }


    // Get Goals
    let goal = await Goal.findOne({
        userId: req.session.userId
    });


    // Create default goals if user does not have any
    if (!goal) {

        goal = await Goal.create({

            userId: req.session.userId,

            calorieGoal: 2000,
            proteinGoal: 120,
            carbGoal: 250,
            fatGoal: 65

        });
    }


    // Count days where goals were hit
    let calorieGoalHits = 0;
    let proteinGoalHits = 0;

    for (const date in dailyTotals) {

        if (
            dailyTotals[date].calories >=
            goal.calorieGoal
        ) {
            calorieGoalHits++;
        }

        if (
            dailyTotals[date].protein >=
            goal.proteinGoal
        ) {
            proteinGoalHits++;
        }
    }


    // Get currently logged-in user
    const currentUser =
        await User.findById(req.session.userId);


    // Send everything to home.ejs
    res.render("home.ejs", {

        foods: foods,

        currentUser: currentUser,

        calorieGoal: goal.calorieGoal,
        proteinGoal: goal.proteinGoal,
        carbGoal: goal.carbGoal,
        fatGoal: goal.fatGoal,

        averageCalories: averageCalories,
        averageProtein: averageProtein,

        daysTracked: daysTracked,

        calorieGoalHits: calorieGoalHits,
        proteinGoalHits: proteinGoalHits

    });
});


// HISTORY
app.get("/history", requireLogin, async (req, res) => {

    const foods = await Food.find({
        userId: req.session.userId
    }).sort({
        createdAt: -1
    });


    const groupedFoods = {};


    for (let i = 0; i < foods.length; i++) {

        let date;

        if (foods[i].createdAt) {

            date =
                foods[i].createdAt.toLocaleDateString();

        } else {

            date = "No date";
        }


        if (!groupedFoods[date]) {

            groupedFoods[date] = [];
        }


        groupedFoods[date].push(foods[i]);
    }


    return res.render("history.ejs", {
        groupedFoods: groupedFoods
    });
});


// ADD FOOD
app.post("/entries", requireLogin, async (req, res) => {

    try {

        const FoodToAdd = {

            userId: req.session.userId,

            food: req.body.food,

            calories: req.body.calories,

            protein: req.body.protein,

            carbs: req.body.carbs,

            fat: req.body.fat
        };


        await Food.create(FoodToAdd);

        res.redirect("/");

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Something went wrong."
        );
    }
});


// DELETE FOOD
app.post("/entries/:id/delete", requireLogin, async (req, res) => {

    try {

        await Food.findOneAndDelete({
            _id: req.params.id,
            userId: req.session.userId
        });

        res.redirect("/");

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Something went wrong."
        );
    }
});


// EDIT FOOD PAGE
app.get("/entries/:id/edit", requireLogin, async (req, res) => {

    try {

        const foodToEdit = await Food.findOne({
            _id: req.params.id,
            userId: req.session.userId
        });


        if (!foodToEdit) {
            return res.redirect("/");
        }


        res.render("edit.ejs", {
            food: foodToEdit
        });

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Something went wrong."
        );
    }
});


// ACCOUNT CREATION
app.get("/register", (req, res) => {

    res.render("register.ejs");
});


app.post("/register", async (req, res) => {

    try {

        const username = req.body.username;
        const email = req.body.email;
        const password = req.body.password;


        // Check if email already exists
        const existingUser =
            await User.findOne({
                email: email
            });


        if (existingUser) {

            return res.send(
                "An account with this email already exists."
            );
        }


        // Hash password
        const hashedPassword =
            await bcrypt.hash(password, 10);


        // Create user
        const user = await User.create({

            username: username,

            email: email,

            password: hashedPassword
        });


        // Log the new user in
        req.session.userId = user._id;


        res.redirect("/");

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Something went wrong."
        );
    }
});


// LOGIN
app.get("/login", (req, res) => {

    res.render("login.ejs");
});


app.post("/login", async (req, res) => {

    try {

        const email = req.body.email;
        const password = req.body.password;


        // Find user by email
        const user =
            await User.findOne({
                email: email
            });


        if (!user) {

            return res.send(
                "Incorrect email or password."
            );
        }


        // Compare entered password with hashed password
        const passwordMatches =
            await bcrypt.compare(
                password,
                user.password
            );


        if (!passwordMatches) {

            return res.send(
                "Incorrect email or password."
            );
        }


        // Remember logged-in user
        req.session.userId = user._id;


        res.redirect("/");

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Something went wrong."
        );
    }
});


// LOGOUT
app.post("/logout", (req, res) => {

    req.session.destroy(() => {

        res.redirect("/login");

    });
});


// UPDATE FOOD
app.post("/entries/:id/edit", requireLogin, async (req, res) => {

    try {

        await Food.findOneAndUpdate(

            {
                _id: req.params.id,
                userId: req.session.userId
            },

            {
                food: req.body.food,

                protein: req.body.protein,

                carbs: req.body.carbs,

                fat: req.body.fat,

                calories: req.body.calories
            },

            {
                runValidators: true
            }

        );


        res.redirect("/");

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Something went wrong."
        );
    }
});


// CLEAR HISTORY
app.post("/history/clear", requireLogin, async (req, res) => {

    await Food.deleteMany({
        userId: req.session.userId
    });

    res.redirect("/history");
});


// UPDATE GOALS
app.post("/goals", requireLogin, async (req, res) => {

    try {

        await Goal.findOneAndUpdate(

            {
                userId: req.session.userId
            },

            {
                calorieGoal:
                    req.body.calorieGoal,

                proteinGoal:
                    req.body.proteinGoal,

                carbGoal:
                    req.body.carbGoal,

                fatGoal:
                    req.body.fatGoal
            },

            {
                runValidators: true
            }

        );


        res.redirect("/");

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Something went wrong."
        );
    }
});


// START SERVER
const startServer = () => {

    console.log(
        `Server running at http://localhost:${port}`
    );
};


app.listen(port, startServer);