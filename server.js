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
    // 💡 検索時は公式TV用クライアントを擬似
    const results = await youtube.search(query, { type: 'video', client: 'YTMEDIALITE' });
    
    if (!results || !results.videos || results.videos.length === 0) return res.json([]);

    const videos = results.videos.filter(video => video.id).map(video => {
      let thumbnailUrl = '';
      if (video.thumbnails && video.thumbnails.length > 0) {
        thumbnailUrl = video.thumbnails[0].url;
      } else if (video.thumbnail && video.thumbnail.length > 0) {
        thumbnailUrl = video.thumbnail[0].url;
      }
      return { id: video.id, title: video.title?.text || 'No Title', thumbnail: thumbnailUrl };
    });
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔗 2. googlevideoストリームURLを直接返却するAPI（修正・強化版）
app.get('/api/stream-url', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Video ID is required');

  try {
    const youtube = await getYoutube();
    
    // 💡 クライアント指定を外す、または「ANDROID_TESTSUITE」など規制に強いものに変更
    const videoInfo = await youtube.getInfo(videoId);
    
    // 💡 音声と映像が1つになっている（最も再生しやすい）フォーマットを厳選
    const format = videoInfo.chooseFormat({
      type: 'video+audio',
      quality: 'best'
    });

    if (!format) {
      throw new Error('No suitable format found');
    }

    // 💡 暗号（シグネチャ）の解読処理を実行
    const player = youtube.session.player;
    const googleVideoUrl = format.decipher(player);

    if (!googleVideoUrl) {
      throw new Error('Failed to decipher streaming URL');
    }

    // 解析できた googlevideo.com のURLを返す
    res.json({ url: googleVideoUrl });

  } catch (error) {
    console.error('--- URL Extraction Error ---');
    console.error(error);
    res.status(500).json({ error: 'Failed to get stream URL', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
