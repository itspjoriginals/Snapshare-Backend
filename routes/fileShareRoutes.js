const express = require('express');
const User = require('../models/userModel');
const Verification = require('../models/verificationModel');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const multer = require('multer');
const nodemailer = require('nodemailer');
const responseFunction = require('../utils/responseFunction');
const fs = require('fs');
const errorHandler = require('../middlewares/errorMiddleware');
const authTokenHandler = require('../middlewares/checkAuthToken');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const dotenv = require('dotenv');
dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

async function mailer(recieveremail, filesenderemail) {
    let transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: "itspjprashant07@gmail.com",
            pass: "hxrl rwyy znwk gmfn"
        }
    })



    let info = await transporter.sendMail({
        from: "Team SnapShare",
        to: recieveremail,
        subject: "new file",
        text: "You recieved a new file from " + filesenderemail,
        html: "<b>You recieved a new file from  " + filesenderemail + "</b>",

    })

    console.log("Message sent: %s", info.messageId);
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

}


const getObjectURL = async (key) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
    }

    return await getSignedUrl(s3Client, new GetObjectCommand(params));

}
const postObjectURL = async (filename, contentType) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: filename,
        ContentType: contentType,
    }

    return await getSignedUrl(s3Client, new PutObjectCommand(params));

}

router.get('/test', async (req, res) => {
    let imgurl = await getObjectURL('myfile803')
    res.send('<img src="' + imgurl + '"/>')
});

router.get('/generatepostobjecturl', authTokenHandler, async (req, res, next) => {
    try {
        const timeinms = new Date().getTime();
        const signedUrl = await postObjectURL(timeinms.toString(), '');
        return responseFunction(res, 200, 'signed url generated', {
            signedUrl: signedUrl,
            filekey: timeinms.toString()
        }, true);
    }
    catch (err) {
        next(err);

    }
})

router.post('/sharefile', authTokenHandler, async (req, res, next) => {
    try {
        const { receiveremail, filename, filekey, fileType } = req.body;

        let senderuser = await User.findOne({ _id: req.userId });
        let recieveruser = await User.findOne({ email: receiveremail });
        if (!senderuser) {
            return responseFunction(res, 400, 'Sender email is not registered', null, false);
        }
        if (!recieveruser) {

            return responseFunction(res, 400, 'Reciever email is not registered', null, false);
        }

        console.log(receiveremail)
        if (senderuser.email === receiveremail) {

            return responseFunction(res, 400, 'Reciever email cannot be same as sender', null, false);
        }

        senderuser.files.push({
            senderemail: senderuser.email,
            receiveremail: receiveremail,
            fileurl: filekey,
            fileType: fileType,
            filename: filename ? filename : new Date().toLocaleDateString(),
            sharedAt: Date.now()
        })

        recieveruser.files.push({
            senderemail: senderuser.email,
            receiveremail: receiveremail,
            fileurl: filekey,
            fileType: fileType,
            filename: filename ? filename : new Date().toLocaleDateString(),
            sharedAt: Date.now()
        })

        await senderuser.save();
        await recieveruser.save();
        await mailer(receiveremail, senderuser.email);
        return responseFunction(res, 200, 'shared successfully', null, true);

    }
    catch (err) {
        next(err);
    }
})
router.get('/getfiles', authTokenHandler, async (req, res, next) => {
    try {
        let user = await User.findOne({ _id: req.userId });
        if (!user) {
            return responseFunction(res, 400, 'User not found', null, false);
        }
        return responseFunction(res, 200, 'files fetched successfully', user.files, true);
    }
    catch (err) {
        next(err);
    }
})


router.get('/gets3urlbykey/:key', authTokenHandler, async (req, res, next) => {
    try {
        const {key} = req.params;
        const signedUrl = await getObjectURL(key);
        if(!signedUrl){
            return responseFunction(res, 400, 'signed url not found', null, false);
        }
        return responseFunction(res, 200, 'signed url generated', {
            signedUrl: signedUrl,
        }, true);
    }
    catch (err) {
        next(err);
    }
})

router.use(errorHandler)

module.exports = router;