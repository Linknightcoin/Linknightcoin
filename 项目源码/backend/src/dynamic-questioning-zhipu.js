const axios = require('axios');

class DynamicQuestioningZhipu {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://open.bigmodel.cn/api/paas/v4';
    }

    async generateNextQuestion(history, currentDescription) {
        const conversationText = history.map((h, i) =>
            `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`
        ).join('\n\n');

        const response = await axios.post(
            `${this.baseURL}/chat/completions`,
            {
                model: 'glm-4-flash',
                messages: [
                    {
                        role: 'system',
                        content: `你是专业的善举采访者。根据用户的善举描述，提出一个针对性的追问问题。

关键要求：
1. 追问必须与具体善举高度相关，不能是通用问题
2. 深入挖掘细节：时间、地点、人物、动机、困难、影响
3. 问题要自然，像朋友间的对话
4. 每次只问一个问题
5. 追问不超过3轮

不同善举的追问示例：
- 帮助老人过马路 → "老人当时是什么状态？为什么需要帮忙？"
- 捐款 → "这笔钱对你意味着什么？为什么选择这个受助对象？"
- 志愿服务 → "服务过程中遇到了什么困难？最触动你的瞬间是什么？"
- 救助动物 → "你是怎么发现它的？当时它是什么状态？"

输出严格JSON格式：
{
    "dimension": "具体维度(时间/地点/人物/动机/过程/困难/影响/感受)",
    "question": "具体问题，必须结合善举细节",
    "reason": "为什么问这个问题"
}`
                    },
                    {
                        role: 'user',
                        content: `善举描述："${currentDescription}"\n\n已完成的对话：\n${conversationText || "（刚开始）"}\n\n请根据这个具体善举，提出一个针对性的追问：`
                    }
                ],
                temperature: 0.8,
                max_tokens: 500
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        const content = response.data.choices[0].message.content;
        
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
            return {
                dimension: parsed.dimension || 'general',
                question: parsed.question,
                reason: parsed.reason || '深入了解善举细节'
            };
        } catch (e) {
            return {
                dimension: 'general',
                question: content.replace(/[{}"]/g, '').replace(/^.*question[:：]\s*/i, '').trim(),
                reason: '深入了解善举细节'
            };
        }
    }

    shouldComplete(history) {
        if (history.length >= 3) return true;
        const hasContent = history.every(h => h.answer.length > 10);
        return history.length >= 2 && hasContent;
    }

    async synthesizeDescription(originalDescription, history) {
        const conversationText = history.map((h) =>
            `Q: ${h.question}\nA: ${h.answer}`
        ).join('\n\n');

        const response = await axios.post(
            `${this.baseURL}/chat/completions`,
            {
                model: 'glm-4-flash',
                messages: [
                    {
                        role: 'system',
                        content: `你将用户的原始描述和问答整合成一个完整、生动的善举故事。要求：
1. 以第一人称叙述
2. 突出关键细节和情感
3. 语言自然流畅
4. 控制字数在200-400字`
                    },
                    {
                        role: 'user',
                        content: `原始描述：${originalDescription}\n\n补充信息：\n${conversationText}\n\n请整合成一个完整的故事：`
                    }
                ],
                temperature: 0.5,
                max_tokens: 600
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        return response.data.choices[0].message.content.trim();
    }
}

module.exports = DynamicQuestioningZhipu;
