const express = require("express");
const multer = require("multer");
const AdmZip = require("adm-zip");
const { createCanvas } = require("canvas");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');

const app = express();
const upload = multer({ dest: "uploads/" });

// Constants
const WIDTH = 854;  // 16:9 aspect ratio (480p: 854x480)
const HEIGHT = 480;
const FRAME_RATE = 10;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const VIDEOS_DIR = path.join(__dirname, "videos");
// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR);
}

app.post("/convert", upload.single("file"), async (req, res) => {
    try {
        const zipPath = req.file.path;
        const binaryData = extractBinaryData(zipPath);
        const framePaths = generateFrames(binaryData);
        console.log("Frames generated:", framePaths.length);
        
        const outputVideo = await createVideo(framePaths);
        console.log("Video created successfully.");
        
        const videoLocation = path.join(VIDEOS_DIR, `output_${Date.now()}.mp4`);
        fs.renameSync(outputVideo, videoLocation);
        
        res.json({ location: videoLocation });
        
        cleanupFiles([zipPath, ...framePaths]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function extractBinaryData(zipPath) {
    const zip = new AdmZip(zipPath);
    let binaryData = "";

    zip.getEntries().forEach(entry => {
        if (!entry.isDirectory) {
            const content = entry.getData();
            binaryData += content.toString("binary");
        }
    });

    return binaryData;
}

function generateFrames(binaryData) {
    const framePaths = [];
    let index = 0;

    // Create an encrypted folder for frames
    const encryptedFolder = path.join(UPLOAD_DIR, crypto.randomBytes(16).toString('hex'));
    if (!fs.existsSync(encryptedFolder)) {
        fs.mkdirSync(encryptedFolder);
    }

    while (index < binaryData.length) {
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext("2d");
        
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                if (index < binaryData.length) {
                    ctx.fillStyle = binaryData[index] === "1" ? "black" : "white";
                } else {
                    ctx.fillStyle = "green"; 
                }
                ctx.fillRect(x, y, 1, 1);
                index++;
            }
        }

        const framePath = path.join(encryptedFolder, `frame_${framePaths.length}.png`);
        fs.writeFileSync(framePath, canvas.toBuffer("image/png"));
        framePaths.push(framePath);
    }

    return framePaths;
}

function createVideo(framePaths) {
    return new Promise((resolve, reject) => {
        const outputVideo = path.join(UPLOAD_DIR, "output.mp4");
        
        const ffmpegProcess = ffmpeg()
            .input(path.join(path.dirname(framePaths[0]), "frame_%d.png"))
            .inputFPS(FRAME_RATE)
            .size(`${WIDTH}x${HEIGHT}`)
            .output(outputVideo)
            .on("end", () => resolve(outputVideo))
            .on("error", reject)
            .run();
    });
}

function cleanupFiles(files) {
    files.forEach(file => {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    });
}

app.listen(3000, () => console.log("Server running on port 3000"));
