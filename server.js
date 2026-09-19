require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = 8080;

// EJS
app.set("view engine", "ejs");

// Public folder
app.use(express.static("public"));

// Allows us to access form data with req.body
app.use(express.urlencoded({ extended: true }));

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


// HOME
app.get("/", async (req, res) => {

    // Today's date
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);


    // 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);


    // Get today's foods
    const foods = await Food.find({
        createdAt: {
            $gte: startOfToday
        }
    });


    // Get last 7 days of foods
    const weeklyFoods = await Food.find({
        createdAt: {
            $gte: sevenDaysAgo
        }
    });


    // Count unique days tracked
    const trackedDays = new Set();

    for (let i = 0; i < weeklyFoods.length; i++) {

        const date = weeklyFoods[i].createdAt.toLocaleDateString();

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

        // If this date does not exist yet
        if (!dailyTotals[date]) {

            dailyTotals[date] = {
                calories: 0,
                protein: 0
            };
        }

        // Add food to that day's totals
        dailyTotals[date].calories +=
            Number(weeklyFoods[i].calories);

        dailyTotals[date].protein +=
            Number(weeklyFoods[i].protein);
    }


    // Get Goals
    let goal = await Goal.findOne();

    if (!goal) {

        goal = await Goal.create({
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

        // Calorie goal reached
        if (dailyTotals[date].calories >= goal.calorieGoal) {
            calorieGoalHits++;
        }

        // Protein goal reached
        if (dailyTotals[date].protein >= goal.proteinGoal) {
            proteinGoalHits++;
        }
    }


    // Send everything to home.ejs
    res.render("home.ejs", {

        foods: foods,

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
app.get("/history", async (req, res) => {

    const foods = await Food.find().sort({
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
app.post("/entries", async (req, res) => {

    try {

        const FoodToAdd = {

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
app.post("/entries/:id/delete", async (req, res) => {

    try {

        await Food.findByIdAndDelete(
            req.params.id
        );

        res.redirect("/");

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Something went wrong."
        );
    }
});


// EDIT FOOD PAGE
app.get("/entries/:id/edit", async (req, res) => {

    try {

        const foodToEdit =
            await Food.findById(req.params.id);


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


// UPDATE FOOD
app.post("/entries/:id/edit", async (req, res) => {

    try {

        await Food.findByIdAndUpdate(

            req.params.id,

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
app.post("/history/clear", async (req, res) => {

    await Food.deleteMany({});

    res.redirect("/history");
});


// UPDATE GOALS
app.post("/goals", async (req, res) => {

    try {

        await Goal.findOneAndUpdate(

            {},

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