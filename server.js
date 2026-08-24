const express = require('express');
const { Innertube, UniversalCache } = require('youtubei.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let youtubeInstance = null;

async function getYoutube() {
  if (!youtubeInstance) {
    youtubeInstance = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true
    });
  }
  return youtubeInstance;
}

// 🔍 1. YouTube動画の検索API
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).send('Query is required');

  try {
    const youtube = await getYoutube();
    
    // 💡 WEBクライアントを明示的に指定して検索
    const results = await youtube.search(query, { 
      type: 'video',
      client: 'WEB' 
    });
    
    if (!results || !results.videos || results.videos.length === 0) {
      return res.json([]);
    }

    const videos = results.videos
      .filter(video => video.id)
      .map(video => {
        let thumbnailUrl = '';
        if (video.thumbnails && video.thumbnails.length > 0) {
          thumbnailUrl = video.thumbnails[0].url;
        } else if (video.thumbnail && video.thumbnail.length > 0) {
          thumbnailUrl = video.thumbnail[0].url;
        }

        return {
          id: video.id,
          title: video.title?.text || 'No Title',
          thumbnail: thumbnailUrl
        };
      });

    res.json(videos);
  } catch (error) {
    console.error('--- Search Error Log ---');
    console.error(error);
    res.status(500).json({ error: 'Error searching videos', message: error.message });
  }
});

// 📺 2. YouTube動画のストリーミングAPI
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Video ID is required');

  try {
    const youtube = await getYoutube();
    
    // 💡 プレイヤーのシグネチャエラーを防ぐためクライアントをWEBに設定
    const stream = await youtube.download(videoId, {
      type: 'video+audio',
      quality: 'best',
      client: 'WEB'
    });

    res.setHeader('Content-Type', 'video/mp4');
    const reader = stream.getReader();
    
    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          res.end();
          return;
        }
        res.write(Buffer.from(value));
        read();
      }).catch(err => {
        console.error('Stream read error:', err);
        res.end();
      });
    }
    read();

  } catch (error) {
    console.error('--- Stream Error Log ---');
    console.error(error);
    res.status(500).send('Error streaming video');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

