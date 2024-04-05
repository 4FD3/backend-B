const express = require('express');
const { Receipt, User } = require('../database/mongooseScripts');
const mongoose = require('mongoose');
const passport = require('passport');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID,);
const router = express.Router();
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');


    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.YOUR_GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (payload['iss'] !== 'accounts.google.com' && payload['iss'] !== 'https://accounts.google.com') {
      throw new Error('Wrong issuer.');
    }

    req.user = {
      _id: payload['sub'],
      email: payload['email'],
    };

    next();
  } catch (error) {
    console.error(error);
    res.status(401).send({ error: 'Please authenticate.' });
  }
};

router.use(authMiddleware);
router.get('/receipts', async (req, res) => {
  try {
    const userId = req.user._id;

    const receipts = await Receipt.find({ userId: userId });
    res.json(receipts);
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

router.get('/years', async (req, res) => {
  try {
    const userId = req.user._id;
    Receipt.aggregate([
      { $match: { "userId": userId } },
      {
        $project: {
          year: { $year: "$createdAt" },
        }
      },
      {
        $group: {
          _id: "$year",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ])
      .then(result => {
        console.log(result);
        res.json(result);
      })
      .catch(err => {
        console.error(err);
        res.status(500).send(err.toString());
      });

  } catch (error) {
    res.status(500).send(error.toString());
  }
});

router.get('/receipts/:receiptId', async (req, res) => {

  try {

    const { receiptId } = req.params;
    const userId = req.user._id;
    console.log("------------ ", receiptId);
    Receipt.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(receiptId), userId: userId, } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.category",
          value: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
        }
      },
      {
        $project: {
          _id: 0,
          name: "$_id",
          value: { $round: ["$value", 2] }
        }
      }
    ]).exec()
      .then(results => {
        console.log("Category totals:", results);
        res.json(results);
      })
      .catch(err => {
        console.error("Aggregation error:", err);
        res.status(500).send(err.toString());
      });

  } catch (error) {
    console.log('========= ', error);
    res.status(500).send(error.toString());
  }
});

router.post('/consumption_by_year', async (req, res) => {

  if (req.body) {
    var { years } = req.body;
    console.log(years);
    if (!Array.isArray(years)) {
      return res.status(400).send('Years is not an array');
    }
  }
  const monthlyTotals = {};
  const userId = req.user._id;
  try {
    for (const year of years) {
      const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
      const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

      const receipts = await Receipt.find({
        userId: userId,
        createdAt: { $gte: startDate, $lte: endDate }
      });
      receipts.forEach(receipt => {
        const month = receipt.createdAt.getMonth();
        const monthName = new Date(receipt.createdAt).toLocaleString('default', { month: 'long' });
        monthlyTotals[monthName] = monthlyTotals[monthName] || {};
        monthlyTotals[monthName][`year_${year}`] = (monthlyTotals[monthName][`year_${year}`] || 0) + receipt.total.reduce((acc, curr) => acc + curr.price, 0);
      });
    }
    const responseData = Object.keys(monthlyTotals).map(month => ({
      name: month,
      ...monthlyTotals[month]
    }));
    res.json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/radar_data', async (req, res) => {
  if (req.body) {
    var { years } = req.body;
    console.log(years);
    if (!Array.isArray(years)) {
      return res.status(400).send('Years is not an array');
    }
  }
  const userId = req.user._id;
  try {
    const categorySums = await Receipt.aggregate([
      { $match: { "userId": userId } },
      {
        $unwind: "$items"
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            category: "$items.category"
          },
          totalAmount: { $sum: "$items.price" }
        }
      },
      {
        $match: {
          "_id.year": { $in: years },
        }
      },
      {
        $group: {
          _id: "$_id.category",
          data: {
            $push: {
              year: "$_id.year",
              amount: "$totalAmount"
            }
          }
        }
      }
    ]);
    let fullMark = 0;
    const dataR = categorySums.map(cat => {
      const categoryData = { subject: cat._id };

      cat.data.forEach(d => {
        categoryData[`year_${d.year}`] = d.amount;
        fullMark = Math.max(fullMark, d.amount);
      });

      return categoryData;
    });


    dataR.forEach(catData => catData.fullMark = fullMark);

    res.json(dataR);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  });


module.exports = router;
