require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { ethers } = require('ethers');
const DynamicQuestioningZhipu = require('./dynamic-questioning-zhipu');

const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// 智谱AI配置（从环境变量读取，务必在 .env 中配置）
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || process.env.DEEPSEEK_API_KEY;
const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const questioner = new DynamicQuestioningZhipu(ZHIPU_API_KEY);
const sessions = new Map();

const scoreAPI = {
    async verifyMerit(userAddress, fullDescription) {
        const response = await axios.post(
            ZHIPU_URL,
            {
                model: 'glm-4-flash',
                messages: [
                    {
                        role: 'system',
                        content: '评估善举，输出JSON：{authenticity:0-100,impact:0-100,effort:0-100,sacrifice:0-100,finalScore:功值,reasoning:"理由",shouldRecord:true/false}'
                    },
                    { role: 'user', content: fullDescription }
                ],
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        const content = response.data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);

        return {
            meritPoints: Math.min(Math.round(result.finalScore), 1000),
            breakdown: {
                authenticity: result.authenticity,
                impact: result.impact,
                effort: result.effort,
                sacrifice: result.sacrifice
            },
            reasoning: result.reasoning,
            shouldRecord: result.shouldRecord && result.authenticity >= 60
        };
    }
};

app.post('/api/verify/start', async (req, res) => {
    try {
        const { userAddress, description } = req.body;
        if (!userAddress || !description) {
            return res.status(400).json({ error: 'Missing userAddress or description' });
        }

        const sessionId = `${userAddress}_${Date.now()}`;
        
        sessions.set(sessionId, {
            userAddress,
            originalDescription: description,
            history: [],
            status: 'questioning',
            createdAt: Date.now()
        });

        const nextQuestion = await questioner.generateNextQuestion([], description);

        res.json({
            success: true,
            sessionId,
            status: 'questioning',
            question: nextQuestion.question,
            dimension: nextQuestion.dimension,
            reason: nextQuestion.reason
        });

    } catch (error) {
        console.error('Start error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/verify/answer', async (req, res) => {
    try {
        const { sessionId, answer, question, dimension } = req.body;
        if (!sessionId || !answer) {
            return res.status(400).json({ error: 'Missing sessionId or answer' });
        }

        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        session.history.push({
            question: question || '追问',
            answer,
            dimension: dimension || 'general',
            timestamp: Date.now()
        });

        const shouldComplete = questioner.shouldComplete(session.history) || 
                              session.history.length >= 3;

        if (shouldComplete) {
            session.status = 'scoring';
            
            const fullDescription = await questioner.synthesizeDescription(
                session.originalDescription,
                session.history
            );

            const scoreResult = await scoreAPI.verifyMerit(
                session.userAddress,
                fullDescription
            );

            session.status = 'completed';
            session.result = scoreResult;
            session.fullDescription = fullDescription;

            res.json({
                success: true,
                sessionId,
                status: 'completed',
                fullDescription,
                score: scoreResult
            });

        } else {
            const nextQuestion = await questioner.generateNextQuestion(
                session.history,
                session.originalDescription
            );

            res.json({
                success: true,
                sessionId,
                status: 'questioning',
                question: nextQuestion.question,
                dimension: nextQuestion.dimension,
                reason: nextQuestion.reason,
                progress: `${session.history.length}/3`
            });
        }

    } catch (error) {
        console.error('Answer error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/verify/direct', async (req, res) => {
    try {
        const { userAddress, description } = req.body;
        if (!userAddress || !description) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const result = await scoreAPI.verifyMerit(userAddress, description);
        res.json({ success: true, userAddress, description, ...result });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 上链记录 - 使用 MERIT_HALVING 合约的 addMerits 函数
app.post('/api/record', async (req, res) => {
    try {
        const { userAddress, points, description } = req.body;
        if (!userAddress || !points) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        
        // MeritHalving 合约 ABI - addMerits(address,uint256)
        const halvingABI = [
            'function addMerits(address user, uint256 merits) external'
        ];
        
        const meritHalving = new ethers.Contract(
            process.env.MERIT_HALVING,
            halvingABI,
            wallet
        );

        // 使用 addMerits 函数（只有2个参数，无description）
        const tx = await meritHalving.addMerits(userAddress, points);
        const receipt = await tx.wait();

        res.json({
            success: true,
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            points: points
        });

    } catch (error) {
        console.error('Record error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询平台总功值和记录数
app.get('/api/platform/stats', async (req, res) => {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC);
        const meritHalving = new ethers.Contract(
            process.env.MERIT_HALVING,
            [
                'function totalMerits() external view returns (uint256)',
                'function currentReward() external view returns (uint256)'
            ],
            provider
        );

        const totalMerit = await meritHalving.totalMerits();
        const currentReward = await meritHalving.currentReward();

        res.json({
            success: true,
            totalMerit: totalMerit.toString(),
            currentReward: currentReward.toString(),
            currentRewardFormatted: ethers.formatEther(currentReward)
        });
    } catch (error) {
        console.error('Platform stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询用户个人功值（注意：getUserMerits视图函数可能不可用，返回提示信息）
app.get('/api/user/:address/merits', async (req, res) => {
    try {
        const { address } = req.params;
        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid address' });
        }

        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC);
        const meritHalving = new ethers.Contract(
            process.env.MERIT_HALVING,
            [
                'function currentReward() external view returns (uint256)'
            ],
            provider
        );

        // getUserMerits 视图函数可能不可用，建议通过链上事件查询
        const currentReward = await meritHalving.currentReward();

        res.json({
            success: true,
            address,
            userMerits: 'N/A（需通过链上事件查询）',
            currentReward: currentReward.toString(),
            currentRewardFormatted: ethers.formatEther(currentReward),
            note: '用户功值需通过 MeritRecorded 事件查询，视图函数 getUserMerits 不可用'
        });
    } catch (error) {
        console.error('User merits error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 奖励池统计
app.get('/api/stats/reward-pool', async (req, res) => {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC);
        const linkToken = new ethers.Contract(
            process.env.LINK_TOKEN,
            ['function balanceOf(address account) external view returns (uint256)'],
            provider
        );

        const rewardPoolBalance = await linkToken.balanceOf(process.env.REWARD_POOL);
        // 总奖励池初始是10500000 LINK
        const totalInitialReward = ethers.parseEther('10500000');
        const distributedReward = totalInitialReward - rewardPoolBalance;

        res.json({
            success: true,
            rewardPoolBalance: ethers.formatEther(rewardPoolBalance),
            distributedReward: ethers.formatEther(distributedReward),
            totalInitialReward: '10500000',
            remainingPercentage: ((rewardPoolBalance * 100n) / totalInitialReward).toString()
        });
    } catch (error) {
        console.error('Reward pool stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 手续费回购统计（totalBurned 已不可用，做容错处理）
app.get('/api/stats/fee-repurchase', async (req, res) => {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC);
        const feeRepurchaser = new ethers.Contract(
            process.env.FEE_REPURCHASER,
            [
                'function totalRepurchased() external view returns (uint256)'
            ],
            provider
        );

        const totalRepurchased = await feeRepurchaser.totalRepurchased();

        // totalBurned() 已从链上合约移除，返回 null 表示不可用
        res.json({
            success: true,
            totalRepurchased: ethers.formatEther(totalRepurchased),
            totalBurned: null,
            feeRate: '2.1%',
            note: 'totalBurned 函数已从链上合约移除'
        });
    } catch (error) {
        console.error('Fee repurchase stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 全网数据分析概览
app.get('/api/stats/overview', async (req, res) => {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC);
        
        // 平台基础数据
        const meritHalving = new ethers.Contract(
            process.env.MERIT_HALVING,
            [
                'function totalMerits() external view returns (uint256)',
                'function halvingCount() external view returns (uint256)',
                'function currentReward() external view returns (uint256)',
                'function getRewardInfo() external view returns (uint256 current, uint256 next, uint256 halvingIndex)'
            ],
            provider
        );

        const [totalMerit, halvingCount, currentReward, rewardInfo] = await Promise.all([
            meritHalving.totalMerits(),
            meritHalving.halvingCount(),
            meritHalving.currentReward(),
            meritHalving.getRewardInfo()
        ]);

        // 奖励池数据
        const linkToken = new ethers.Contract(
            process.env.LINK_TOKEN,
            ['function balanceOf(address account) external view returns (uint256)'],
            provider
        );
        const rewardPoolBalance = await linkToken.balanceOf(process.env.REWARD_POOL);
        const totalInitialReward = ethers.parseEther('10500000');
        const distributedReward = totalInitialReward - rewardPoolBalance;

        // 计算减半进度
        const halvingInterval = 210000n; // 每21万功值减半
        const currentMeritInCycle = totalMerit % halvingInterval;
        const halvingProgress = (currentMeritInCycle * 100n) / halvingInterval;

        res.json({
            success: true,
            overview: {
                totalMerit: totalMerit.toString(),
                halvingCount: halvingCount.toString(),
                currentRewardPerBU: ethers.formatEther(currentReward),
                nextHalvingPoint: rewardInfo.next.toString(),
                halvingProgress: halvingProgress.toString(),
                remainingReward: ethers.formatEther(rewardPoolBalance),
                distributedReward: ethers.formatEther(distributedReward),
                totalUsers: '待实现',
                totalSubmissions: '待实现'
            }
        });
    } catch (error) {
        console.error('Overview stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => res.json({
    status: 'ok',
    mode: 'zhipu-ai-blockchain',
    model: 'glm-4-flash',
    sessions: sessions.size
}));

// 清理过期会话
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.createdAt > 3600000) {
            sessions.delete(id);
        }
    }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 智谱AI + 区块链验证器 运行中: http://localhost:${PORT}`));
