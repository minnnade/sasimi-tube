const express = require('express');
const { Innertube, UniversalCache } = require('youtubei.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let youtubeInstance = null;

async function getYoutube() {
  if (!youtubeInstance) {
    // 💡 セッションを完全に安定させ、公式のPoToken要件を部分的にスルーさせる初期化設定
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
    // 最も規制を受けにくいTV用クライアントで検索を実行
    const results = await youtube.search(query, { type: 'video', client: 'YTMEDIALITE' });
    
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

// 🔗 2. googlevideoストリームURLを直接返却するAPI（最新規制・Bypass版）
app.get('/api/stream-url', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Video ID is required');

  try {
    const youtube = await getYoutube();
    
    // 💡 2026年現在の規制を最も回避しやすい「iOS」または「EMBEDDED」を明示的に指定して情報取得
    // これにより、通常のWEBアクセスとして弾かれるのを防ぎます
    const videoInfo = await youtube.getInfo(videoId, 'IOS');
    
    // 映像と音声が1つになっている最適なフォーマットを選択
    let format = videoInfo.chooseFormat({
      type: 'video+audio',
      quality: 'best'
    });

    // 💡 もし上記で見つからない場合、クライアントを「ANDROID_TESTSUITE」に変えて強制リトライ
    if (!format) {
      const backupInfo = await youtube.getInfo(videoId, 'ANDROID_TESTSUITE');
      format = backupInfo.chooseFormat({ type: 'video+audio', quality: 'best' });
    }

    if (!format) {
      throw new Error('No suitable format found');
    }

    // 💡 暗号解読の実行（2重の安全対策）
    let googleVideoUrl = '';
    try {
      googleVideoUrl = format.decipher(youtube.session.player);
    } catch (e) {
      // 解読メソッドが失敗した場合、生データから直接URL（すでに解号済みのもの）を取得
      googleVideoUrl = format.url || format.signature_cipher;
    }

    if (!googleVideoUrl) {
      throw new Error('Failed to extract URL string');
    }

    // 解析成功した googlevideo.com のURLをフロントに返す
    res.json({ url: googleVideoUrl });

  } catch (error) {
    console.error('--- URL Extraction Error Log ---');
    console.error(error);
    console.error('---------------------------------');
    res.status(500).json({ error: 'Failed to get stream URL', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

