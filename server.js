const express = require('express');
const { Innertube, UniversalCache } = require('youtubei.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// publicフォルダ内の静的ファイル（index.html）を公開
app.use(express.static(path.join(__dirname, 'public')));

// 共通のInnertubeインスタンスを保持する変数（起動の高速化とキャッシュ共有のため）
let youtubeInstance = null;

// YouTubei.jsを安全に初期化する関数
async function getYoutube() {
  if (!youtubeInstance) {
    // 💡 キャッシュを有効にし、セッションを安定させる
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
    
    // 💡 規制を回避しやすい「TV用クライアント」を一時的に指定して検索
    const results = await youtube.search(query, { 
      type: 'video',
      client: 'YTMEDIALITE' 
    });
    
    if (!results || !results.videos || results.videos.length === 0) {
      return res.json([]);
    }

    // フロントエンドに必要なデータだけを成形して返す
    const videos = results.videos
      .filter(video => video.id) // IDが存在する動画のみに絞り込み
      .map(video => {
        // サムネイルの安全なURL取得
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
    console.error('------------------------');
    res.status(500).json({ error: 'Error searching videos', message: error.message });
  }
});

// 📺 2. YouTube動画のストリーミングAPI
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Video ID is required');

  try {
    const youtube = await getYoutube();
    
    // 動画データ（映像＋音声）を取得
    const stream = await youtube.download(videoId, {
      type: 'video+audio',
      quality: 'best',
      client: 'ANDROID_TESTSUITE' // 規制を最も回避しやすいAndroid公式アプリの設定
    });

    res.setHeader('Content-Type', 'video/mp4');
    const reader = stream.getReader();
    
    // 取得した動画データを少しずつブラウザに流し込む（パススルー）
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
    console.error('------------------------');
    res.status(500).send('Error streaming video');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
