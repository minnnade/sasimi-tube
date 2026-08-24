const express = require('express');
const { Innertube } = require('youtubei.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// publicフォルダ内の静的ファイル（index.html）を公開
app.use(express.static(path.join(__dirname, 'public')));

// 🔍 1. YouTube動画の検索API
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).send('Query is required');

  try {
    const youtube = await Innertube.create();
    // YouTubeでキーワード検索を実行（動画のみに限定）
    const results = await youtube.search(query, { type: 'video' });
    
    // フロントエンドに必要なデータだけを成形して返す
    const videos = results.videos.map(video => ({
      id: video.id,
      title: video.title?.text || 'No Title',
      thumbnail: video.thumbnails?.[0]?.url || ''
    }));

    res.json(videos);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).send('Error searching videos');
  }
});

// 📺 2. YouTube動画のストリーミングAPI
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Video ID is required');

  try {
    const youtube = await Innertube.create();
    
    // 動画データ（映像＋音声）を取得
    const stream = await youtube.download(videoId, {
      type: 'video+audio',
      quality: 'best',
      client: 'ANDROID_TESTSUITE' // 規制を回避しやすいYouTube公式アプリのフリをする設定
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
    console.error('Error fetching video:', error);
    res.status(500).send('Error streaming video');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
