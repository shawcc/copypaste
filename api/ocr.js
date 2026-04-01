export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base64Image, customApiUrl, customApiModel, customApiKey } = req.body;
    if (!base64Image) {
      return res.status(400).json({ error: 'Missing base64Image' });
    }

    // 优先使用请求里带的私有配置，如果没传，则使用 Vercel 环境变量里的兜底配置
    const apiUrl = customApiUrl || process.env.VOLC_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    const apiModel = customApiModel || process.env.VOLC_API_MODEL; 
    const apiKey = customApiKey || process.env.VOLC_API_KEY;

    if (!apiModel || !apiKey) {
      return res.status(500).json({ error: 'Server configuration missing' });
    }

    const payload = {
      model: apiModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "请提取这张图片中的所有文案文字，只需要返回提取到的纯文本，不需要任何其他描述或格式化标记。如果图片中没有文字，请回复'无文字'。" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ]
        }
      ]
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upstream API Error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return res.status(200).json({ text: data.choices[0].message.content });
    }
    
    return res.status(500).json({ error: 'Invalid upstream response format' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}