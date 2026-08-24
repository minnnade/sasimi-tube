const express = require('express');
const { Innertube } = require('youtubei.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// 動画のストリーミング用エンドポイント
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Video ID is required');

  try {
    const youtube = await Innertube.create();
    
    // ストリーム情報を取得
    const stream = await youtube.download(videoId, {
      type: 'video+audio',
      quality: 'best',
      client: 'ANDROID_TESTSUITE' // 規制を回避しやすいクライアントを指定
    });

    res.setHeader('Content-Type', 'video/mp4');
    
    // ReadableStreamをNodeのパススルー経由でレスポンスに流し込む
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
    console.error('Error fetching video:', error);
    res.status(500).send('Error streaming video');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
