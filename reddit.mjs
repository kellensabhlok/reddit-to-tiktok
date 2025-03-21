//subreddit string: get subreddit as json, limit to 10 posts
import {Filter} from 'bad-words'
// const nodeHtmlToImage = require('node-html-to-image')
import nodeHtmlToImage from 'node-html-to-image';
// const {ElevenLabsClient} = require('elevenlabs');
import {ElevenLabsClient} from 'elevenlabs';
// const getMP3Duration = require('get-mp3-duration')
import getMP3Duration from 'get-mp3-duration';

const ffmpegPath = import('@ffmpeg-installer/ffmpeg').path;
// const ffmpeg = require('fluent-ffmpeg')
import ffmpeg from 'fluent-ffmpeg';
ffmpeg.setFfmpegPath(ffmpegPath);
// const {createWriteStream} = require('fs')
import {createWriteStream} from "fs";
const fs_promise = import('fs').promises
const subreddit_json = "https://www.reddit.com/r/twosentencehorror.json?limit=10"
const filter = new Filter();
// const {configDotenv} = require('dotenv')
import {configDotenv} from "dotenv";
// const {fs} = require('fs')
import * as fs from "fs";



configDotenv();
function validatePost(post) {
    //validate that post isn't too long (i.e. moderator posts, bad formatting)
    //giving 1 extra sentence in case of error (sentence should be 3 sentences or less
    let num_sentences = 0;
    num_sentences += post.title.split(".").length
    num_sentences += post.selftext.split(".").length
    if(num_sentences > 3)
        return false;

    containsProfanity(post).then(found =>{
        console.log(found);
        if(found === true)
            return false;
    })
    //validate that post is appropriate for tiktok
    return true;
}

async function containsProfanity(post){

    let text = `${post.title} ${post.selftext}`
    console.log(text)
    return filter.isProfane(text);
    // return true;

}

async function generateSpeechFile(post){

    const client = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY
    });

    const audio = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
        text: `${post.title} ${post.selftext}`,
        model_id: "eleven_multilingual_v2",
        output_format: "mp3_44100_128",
    });


    const fileName = `${post.id}.mp3`
    const fileStream = createWriteStream(fileName);
    audio.pipe(fileStream);
    console.log("audio received and saved to file")
}


async function saveImageOfPost(post){


    const html = `
    <html>
      <head>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          h1 { font-size: 24px; }
          p { font-size: 16px; line-height: 1.4; }
        </style>
      </head>
      <body>
        <div style="display: flex;flex-direction: row">
            <h3>${post.subreddit_name_prefixed}</h3>
            <h3 style="color: grey; padding-left: 2%; font-weight: lighter">u/${post.author_fullname}</h3>
        </div>
        
       
        <h1>${post.title}</h1>
        <p>${post.selftext}</p>
        
      </body>
    </html>
  `;
    const image = await nodeHtmlToImage({
        html: html,
        output: `${post.id}.png`
    });
    console.log("post saved as image");
}
async function waitForFile(filePath, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        try {
            await fs_promise.access(filePath);
            // File exists, so resolve the promise
            return true;
        } catch (error) {
            // File doesn't exist yet, wait and try again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    throw new Error(`Timeout waiting for file: ${filePath}`);
}
async function convertToVideo(post){
    const duration = await getRoundedDuration(post);
    console.log(`${post.id}:`, duration, 'ms')
    let newMp4 = ffmpeg();
    newMp4
        .input(`./${post.id}.png`)
        .save(`./${post.id}.mp4`)
        .outputFPS(1) // Control FPS
        .frames(duration) // Control frame number
        .on('end', () => {
            console.log("image converted to video");
        });
    await waitForFile(`./${post.id}.mp4`, 10000)
    let withAudio = ffmpeg();
    withAudio
        .input(`./${post.id}.mp4`)
        .input(`./${post.id}.mp3`)
        .save(`./${post.id}_finished.mp4`)
        .on('end', () =>{
            console.log("audio added to video")
        })
}

async function getRoundedDuration(post) {
    const filepath = `./${post.id}.mp3`
    await waitForFile(filepath)
    const buffer = fs.readFileSync(filepath)
    const ms = getMP3Duration(buffer)
    return Math.ceil(ms / 1000) * 1000;

}

async function postVideo(post){

}

async function cleanupCreationFiles(post) {
    deleteFile(`./${post.id}.png`)
    deleteFile(`./${post.id}.mp3`)
    deleteFile(`./${post.id}.mp4`)

}

async function deleteFile(filepath){
    fs.unlink(filepath, (err) => {
        if (err) {
            console.error(`Error deleting file: ${err}`);
            return;
        }
        console.log(`File ${filepath} deleted successfully`);
    })
}

async function createPosts() {
    try {
        //get posts from subreddit
        const response = await fetch(subreddit_json);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        //get data from response json
        const json = await response.json();
        let posts = json.data.children.map(child => child.data);


        //filter posts, remove any made by a moderator, other filters to come.
        for (const post of posts) {
            if (post.distinguished === 'moderator') {
                posts = posts.filter(item => item !== post)
            } else {
                validatePost(post);
                // if (validatePost(post)) {
                //     await saveImageOfPost(post);
                //     await generateSpeechFile(post);
                //     await convertToVideo(post);
                //     await cleanupCreationFiles(post);
                // }

            }

        }

    } catch (error) {
        console.error(error.message);
    }
}


createPosts()