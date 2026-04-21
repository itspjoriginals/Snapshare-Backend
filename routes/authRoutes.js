const express = require("express");
const User = require("../models/userModel");
const Verification = require("../models/verificationModel");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const nodemailer = require("nodemailer");
const responseFunction = require("../utils/responseFunction");
const fs = require("fs");
const errorHandler = require("../middlewares/errorMiddleware");
const authTokenHandler = require("../middlewares/checkAuthToken");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const dotenv = require("dotenv");

dotenv.config();

// ================= AWS CONFIG =================
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ================= MAILER =================
const mailer = async (receiverEmail, code) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"SnapShare Team" <${process.env.EMAIL_USER}>`,
      to: receiverEmail,
      subject: "OTP for SnapShare",
      text: `Your OTP is ${code}`,
      html: `<b>Your OTP is ${code}</b>`,
    });

    console.log("Email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Mailer Error:", error);
    return false;
  }
};

// ================= ROUTES =================

router.get("/test", (req, res) => {
  res.send("Auth routes are working!");
});

// ================= SEND OTP =================
router.post("/sendotp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return responseFunction(res, 400, "Email is required", null, false);
  }

  try {
    await Verification.deleteOne({ email });

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const isSent = await mailer(email, code);
    if (!isSent) {
      return responseFunction(
        res,
        500,
        "Failed to send OTP email",
        null,
        false,
      );
    }

    const newVerification = new Verification({
      email,
      code,
    });

    await newVerification.save();

    return responseFunction(res, 200, "OTP sent successfully", null, true);
  } catch (err) {
    console.log(err);
    return responseFunction(res, 500, "Internal server error", null, false);
  }
});

// ================= REGISTER =================
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, otp, profilePic } = req.body;

    let user = await User.findOne({ email });
    let verificationQueue = await Verification.findOne({ email });

    if (user) {
      return responseFunction(res, 400, "User already exists", null, false);
    }

    if (!verificationQueue) {
      return responseFunction(res, 400, "Please send otp first", null, false);
    }

    // FIXED: direct compare instead of bcrypt
    console.log("Entered OTP:", otp);
    console.log("DB OTP:", verificationQueue.code);
    const isMatch = await bcrypt.compare(otp.trim(), verificationQueue.code);

    if (!isMatch) {
      return responseFunction(res, 400, "Invalid OTP", null, false);
    }

    user = new User({
      name,
      email,
      password,
      profilePic,
    });

    await user.save();
    await Verification.findOneAndUpdate({ email }, { otp }, { upsert: true });

    return responseFunction(res, 200, "Registered successfully", null, true);
  } catch (err) {
    console.log(err);
    return responseFunction(res, 500, "Internal server error", null, false);
  }
});

// ================= LOGIN =================
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return responseFunction(res, 400, "Invalid credentials", null, false);
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return responseFunction(res, 400, "Invalid credentials", null, false);
    }

    const authToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "10m" },
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET_KEY,
      { expiresIn: "50m" },
    );

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("authToken", authToken, {
      sameSite: isProd ? "none" : "lax",
      httpOnly: true,
      secure: isProd,
    });

    res.cookie("refreshToken", refreshToken, {
      sameSite: isProd ? "none" : "lax",
      httpOnly: true,
      secure: isProd,
    });

    return responseFunction(
      res,
      200,
      "Logged in successfully",
      {
        authToken,
        refreshToken,
      },
      true,
    );
  } catch (err) {
    next(err);
  }
});

// ================= CHECK LOGIN =================
router.get("/checkLogin", authTokenHandler, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ ok: false });
    }

    return res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic
      }
    });

  } catch (err) {
    return res.status(500).json({ ok: false });
  }
});

// ================= LOGOUT =================
router.post("/logout", authTokenHandler, async (req, res) => {
  res.clearCookie("authToken");
  res.clearCookie("refreshToken");

  res.json({
    ok: true,
    message: "Logged out successfully",
  });
});

// ================= GET USER =================
router.get("/getuser", authTokenHandler, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return responseFunction(res, 400, "User not found", null, false);
    }

    return responseFunction(res, 200, "User found", user, true);
  } catch (err) {
    next(err);
  }
});

// ================= CHANGE PASSWORD =================
router.post("/changePassword", async (req, res, next) => {
  try {
    const { email, otp, password } = req.body;

    let user = await User.findOne({ email });
    let verificationQueue = await Verification.findOne({ email });

    if (!user) {
      return responseFunction(res, 400, "User doesn't exist", null, false);
    }

    if (!verificationQueue) {
      return responseFunction(res, 400, "Please send otp first", null, false);
    }

    const isMatch = otp == verificationQueue.code;

    if (!isMatch) {
      return responseFunction(res, 400, "Invalid OTP", null, false);
    }

    user.password = password;
    await user.save();

    await Verification.deleteOne({ email });

    return responseFunction(
      res,
      200,
      "Password changed successfully",
      null,
      true,
    );
  } catch (err) {
    next(err);
  }
});

// ================= S3 HELPERS =================
const getObjectURL = async (key) => {
  return await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    }),
  );
};

const postObjectURL = async (filename, contentType) => {
  return await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: filename,
      ContentType: contentType,
    }),
  );
};

// ================= GENERATE URL =================
router.get("/generatePostObjectUrl", async (req, res, next) => {
  try {
    const timeinms = new Date().getTime();

    const signedUrl = await postObjectURL(timeinms.toString(), "");

    return responseFunction(
      res,
      200,
      "Signed URL generated",
      {
        signedUrl,
        filekey: timeinms.toString(),
      },
      true,
    );
  } catch (err) {
    next(err);
  }
});

// ================= ERROR HANDLER =================
router.use(errorHandler);

module.exports = router;
