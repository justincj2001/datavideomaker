const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const { createCanvas, loadImage } = require("canvas");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const upload = multer({ dest: "uploads/" });

const WIDTH = 854;
const HEIGHT = 480;
const FRAME_RATE = 10;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const ZIP_DIR = path.join(__dirname, "zips");

if (!fs.existsSync(ZIP_DIR)) {
    fs.mkdirSync(ZIP_DIR);
}

app.post("/revert", upload.single("file"), async (req, res) => {
    try {
        const videoPath = req.file.path;
        const frameFolder = path.join(UPLOAD_DIR, crypto.randomBytes(16).toString("hex"));
        fs.mkdirSync(frameFolder);

        await extractFrames(videoPath, frameFolder);
        const files = await reconstructFiles(frameFolder);
        const zipPath = createZipFromFiles(files);

        res.json({ location: zipPath });
        cleanupFiles([videoPath, frameFolder]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function extractFrames(videoPath, frameFolder) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .output(path.join(frameFolder, "frame_%d.png"))
            .fps(FRAME_RATE)
            .on("end", resolve)
            .on("error", reject)
            .run();
    });
}

async function reconstructFiles(frameFolder) {
    const frameFiles = fs.readdirSync(frameFolder).sort();
    const files = {};
    let currentFile = "";
    let fileData = "";

    for (const file of frameFiles) {
        const imagePath = path.join(frameFolder, file);
        const img = await loadImage(imagePath);

        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
        let tempData = "";
        for (let i = 0; i < imgData.length; i += 4) {
            if (imgData[i] === 0) tempData += "1";
            else if (imgData[i] === 255) tempData += "0";
        }

        if (tempData.startsWith("FILE_START:")) {
            if (currentFile) files[currentFile] = Buffer.from(fileData, "binary");
            currentFile = tempData.split(":")[1];
            fileData = "";
        } else {
            fileData += tempData;
        }
    }
    if (currentFile) files[currentFile] = Buffer.from(fileData, "binary");
    return files;
}

function createZipFromFiles(files) {
    const zip = new AdmZip();
    Object.keys(files).forEach(filename => {
        zip.addFile(filename, files[filename]);
    });

    const zipPath = path.join(ZIP_DIR, `reverted_${Date.now()}.zip`);
    zip.writeZip(zipPath);
    return zipPath;
}

function cleanupFiles(files) {
    files.forEach(file => {
        if (fs.existsSync(file)) {
            fs.rmSync(file, { recursive: true, force: true });
        }
    });
}

app.listen(3000, () => console.log("Server running on port 3000"));
