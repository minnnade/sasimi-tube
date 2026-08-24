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
    const results = await youtube.search(query, { type: 'video', client: 'WEB' });
    
    if (!results || !results.videos || results.videos.length === 0) return res.json([]);

    const videos = results.videos.filter(video => video.id).map(video => {
      let thumbnailUrl = video.thumbnails?.[0]?.url || video.thumbnail?.[0]?.url || '';
      return { id: video.id, title: video.title?.text || 'No Title', thumbnail: thumbnailUrl };
    });
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔗 2. googlevideoストリームURLを直接返却するAPI
app.get('/api/stream-url', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Video ID is required');

  try {
    const youtube = await getYoutube();
    
    // 動画の全詳細情報を取得
    const videoInfo = await youtube.getInfo(videoId, 'WEB');
    
    // 💡 映像と音声が合体している形式（Format）の中から最適なストリームURLを1つ抽出
    const format = videoInfo.chooseFormat({
      type: 'video+audio', 
      quality: 'best'
    });

    if (!format || !format.decipher(youtube.session.player)) {
      throw new Error('Failed to decipher stream URL');
    }

    // 解号（デシファ）された「googlevideo.com」の生のURLを取得
    const googleVideoUrl = format.url;

    // ブラウザにURLをテキストでそのまま返す
    res.json({ url: googleVideoUrl });

  } catch (error) {
    console.error('Failed to get googlevideo URL:', error);
    res.status(500).json({ error: 'Failed to get stream URL', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
