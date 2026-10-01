const fs = require('fs');
const path = require('path');

// Tenta carregar .env de múltiplos locais possíveis (desenvolvimento e produção empacotada)
const candidateEnvPaths = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(path.dirname(process.execPath || ''), '.env'),
    process.env.PORTABLE_EXECUTABLE_DIR ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, '.env') : null
].filter(Boolean);

for (const p of candidateEnvPaths) {
    if (fs.existsSync(p)) {
        require('dotenv').config({ path: p });
        break;
    }
}
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const os = require('os');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const { fetchReidosChannels, fetchReidosSports } = require('./services/reidos-api');


function getTmdbAuth() {
    const key = process.env.TMDB_API_KEY || '';
    const token = process.env.TMDB_ACCESS_TOKEN || '';
    const hasKey = Boolean(key && key !== 'SUA_CHAVE_AQUI');
    const hasToken = Boolean(token && token !== 'SEU_TOKEN_AQUI');
    return { key, token, hasKey, hasToken };
}


// Catálogo padrão de filmes e séries caso a conexão externa falhe ou esteja offline
const DEFAULT_CONTENT = [
    {
        title: 'Lançamentos na Netflix',
        type: 'movie',
        items: [
            {
                id: 119051,
                type: 'tv',
                title: 'Wandinha',
                overview: 'Inteligente, sarcástica e um pouco morta por dentro, Wandinha Addams investiga uma onda de assassinatos enquanto faz novos amigos — e inimigos — na Escola Nunca Mais.',
                vote_average: 8.4,
                release_date: '2022-11-23',
                backdrop: 'https://image.tmdb.org/t/p/w1280/iHSwvRVsRyxKuOCzgEcBm6EuaVd.jpg',
                image: 'https://image.tmdb.org/t/p/w500/9PFonB99qQiq4owvZi9ezR1IHqi.jpg'
            },
            {
                id: 66732,
                type: 'tv',
                title: 'Stranger Things',
                overview: 'Quando um garoto desaparece, a cidade toda se mobiliza para as buscas. Mas o que encontram é um mistério envolvendo forças sobrenaturais e experimentos secretos.',
                vote_average: 8.6,
                release_date: '2016-07-15',
                backdrop: 'https://image.tmdb.org/t/p/w1280/56v2KjBlU4XaOv9rVYEQypROD7P.jpg',
                image: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg'
            },
            {
                id: 93405,
                type: 'tv',
                title: 'Round 6',
                overview: 'Centenas de jogadores falidos aceitam um estranho convite para um jogo de sobrevivência infantil com um prêmio milionário.',
                vote_average: 7.8,
                release_date: '2021-09-17',
                backdrop: 'https://image.tmdb.org/t/p/w1280/2meX1nMdScFOoV4370rqHWKm5oY.jpg',
                image: 'https://image.tmdb.org/t/p/w500/dDlG1T3w2nE09sE7rY0F0Qv3Q9b.jpg'
            },
            {
                id: 111110,
                type: 'tv',
                title: 'ONE PIECE: A Série',
                overview: 'Com seu chapéu de palha e uma tripulação nada convencional, o jovem Monkey D. Luffy parte em uma jornada épica em busca do maior tesouro de todos.',
                vote_average: 8.2,
                release_date: '2023-08-31',
                backdrop: 'https://image.tmdb.org/t/p/w1280/4fLZUr1eSlGdrl5EgGrHNmZFiqJ.jpg',
                image: 'https://image.tmdb.org/t/p/w500/fcXdJUSDiDiStIg59As27ipKE8v.jpg'
            },
            {
                id: 87739,
                type: 'tv',
                title: 'O Gambito da Rainha',
                overview: 'Em um orfanato nos anos 1950, uma garota prodígio descobre um talento impressionante para o xadrez enquanto luta contra o vício.',
                vote_average: 8.5,
                release_date: '2020-10-23',
                backdrop: 'https://image.tmdb.org/t/p/w1280/34OGjFEbHj0E3lE2w0iTUVq04Sl.jpg',
                image: 'https://image.tmdb.org/t/p/w500/zU0WkiPpoc3n4FlrjSqJj0KCIUt.jpg'
            }
        ]
    },
    {
        title: 'Séries em Alta',
        type: 'tv',
        items: [
            {
                id: 100088,
                type: 'tv',
                title: 'The Last of Us',
                overview: 'Vinte anos após a destruição da civilização moderna, Joel é contratado para contrabandear Ellie, uma jovem de 14 anos, para fora de uma zona de quarentena militarizada.',
                vote_average: 8.6,
                release_date: '2023-01-15',
                backdrop: 'https://image.tmdb.org/t/p/w1280/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg',
                image: 'https://image.tmdb.org/t/p/w500/uKvVjHNqB5VmOrdxqAt2V7JMrqi.jpg'
            },
            {
                id: 94997,
                type: 'tv',
                title: 'A Casa do Dragão',
                overview: 'Cerca de 200 anos antes dos eventos de Game of Thrones, a dinastia Targaryen domina Westeros enquanto conflitos internos ameaçam o trono.',
                vote_average: 8.4,
                release_date: '2022-08-21',
                backdrop: 'https://image.tmdb.org/t/p/w1280/etj5x22tONZh043xyG09mPvhjhJ.jpg',
                image: 'https://image.tmdb.org/t/p/w500/1X4h40fcB4WWUmIBK0auT4zRBAV.jpg'
            },
            {
                id: 1396,
                type: 'tv',
                title: 'Breaking Bad: A Química do Mal',
                overview: 'Ao descobrir que tem um câncer terminal, um professor de química do ensino médio se junta a um ex-aluno para fabricar e vender metanfetamina.',
                vote_average: 8.9,
                release_date: '2008-01-20',
                backdrop: 'https://image.tmdb.org/t/p/w1280/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
                image: 'https://image.tmdb.org/t/p/w500/3xnWaLQjelJDDF7LT1WBo6f4BRe.jpg'
            },
            {
                id: 76479,
                type: 'tv',
                title: 'The Boys',
                overview: 'Uma visão divertida e irreverente do que acontece quando super-heróis abusam de seus superpoderes em vez de usá-los para o bem.',
                vote_average: 8.5,
                release_date: '2019-07-26',
                backdrop: 'https://image.tmdb.org/t/p/w1280/n6bUvigpRFqSwmPp1m2YADdbRBc.jpg',
                image: 'https://image.tmdb.org/t/p/w500/ut4ZF9qlV4Do2n2964Avy4bL8fI.jpg'
            }
        ]
    },
    {
        title: 'Filmes Populares',
        type: 'movie',
        items: [
            {
                id: 76600,
                type: 'movie',
                title: 'Avatar: O Caminho da Água',
                overview: 'Mais de uma década após a primeira batalha de Pandora, Jake Sully e Neytiri formaram uma família e lutam para protegê-la de uma nova ameaça.',
                vote_average: 7.7,
                release_date: '2022-12-14',
                backdrop: 'https://image.tmdb.org/t/p/w1280/8YFL5QQDJqJYFEhmv1LL7AcRe85.jpg',
                image: 'https://image.tmdb.org/t/p/w500/mbYQLLduugj93zs2G0qC9d5vPdr.jpg'
            },
            {
                id: 157336,
                type: 'movie',
                title: 'Interestelar',
                overview: 'Um grupo de exploradores faz uso de um recém-descoberto buraco de minhoca para superar as limitações das viagens espaciais humanas e vencer as grandes distâncias de uma viagem interestelar.',
                vote_average: 8.4,
                release_date: '2014-11-05',
                backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
                image: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'
            },
            {
                id: 414906,
                type: 'movie',
                title: 'The Batman',
                overview: 'Em seu segundo ano de combate ao crime, Batman investiga a corrupção oculta de Gotham City após o assassinato do prefeito pelo misterioso Charada.',
                vote_average: 7.7,
                release_date: '2022-03-01',
                backdrop: 'https://image.tmdb.org/t/p/w1280/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg',
                image: 'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg'
            },
            {
                id: 872585,
                type: 'movie',
                title: 'Oppenheimer',
                overview: 'A história do físico americano J. Robert Oppenheimer, seu papel no Projeto Manhattan e no desenvolvimento da bomba atômica durante a Segunda Guerra Mundial.',
                vote_average: 8.1,
                release_date: '2023-07-19',
                backdrop: 'https://image.tmdb.org/t/p/w1280/fm6K9vY9wgjhCwMHIZaptxTV32Q.jpg',
                image: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg'
            },
            {
                id: 533535,
                type: 'movie',
                title: 'Deadpool & Wolverine',
                overview: 'Wade Wilson leva uma vida tranquila até ser recrutado pela Autoridade de Variância Temporal para uma missão que pode salvar o multiverso, ao lado do relutante Wolverine.',
                vote_average: 7.7,
                release_date: '2024-07-24',
                backdrop: 'https://image.tmdb.org/t/p/w1280/9l1eZiJHmhr5jIlthMdJN5ZLOvd.jpg',
                image: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4tmnEdMubf.jpg'
            }
        ]
    },
    {
        title: 'Ação e Aventura',
        type: 'movie',
        items: [
            {
                id: 603692,
                type: 'movie',
                title: 'John Wick 4: Baba Yaga',
                overview: 'Com o preço por sua cabeça cada vez maior, o lendário assassino John Wick leva sua luta contra a Alta Cúpula até as mais poderosas figuras do submundo global.',
                vote_average: 7.8,
                release_date: '2023-03-22',
                backdrop: 'https://image.tmdb.org/t/p/w1280/h8gHn0OzBoaefW0Yujq09a9h29h.jpg',
                image: 'https://image.tmdb.org/t/p/w500/r2J02Z2OpNTctfOSN2Ydgii51I3.jpg'
            },
            {
                id: 569094,
                type: 'movie',
                title: 'Homem-Aranha: Através do Aranhaverso',
                overview: 'Miles Morales é catapultado através do Multiverso, onde ele encontra uma equipe de Pessoas-Aranha encarregadas de proteger sua própria existência.',
                vote_average: 8.4,
                release_date: '2023-05-31',
                backdrop: 'https://image.tmdb.org/t/p/w1280/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg',
                image: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg'
            },
            {
                id: 299534,
                type: 'movie',
                title: 'Vingadores: Ultimato',
                overview: 'Após os eventos devastadores de Guerra Infinita, o universo está em ruínas. Com a ajuda dos aliados restantes, os Vingadores se reúnem mais uma vez para desfazer as ações de Thanos.',
                vote_average: 8.3,
                release_date: '2019-04-24',
                backdrop: 'https://image.tmdb.org/t/p/w1280/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg',
                image: 'https://image.tmdb.org/t/p/w500/q6725aR8Zs4IwGMXzZT8aC8lh41.jpg'
            }
        ]
    },
    {
        title: 'Documentários & Fatos',
        type: 'movie',
        items: [
            {
                id: 83880,
                type: 'tv',
                title: 'Nosso Planeta',
                overview: 'Experiencie a beleza natural do planeta Terra e descubra como as mudanças climáticas impactam todas as criaturas vivas nesta extraordinária série.',
                vote_average: 8.7,
                release_date: '2019-04-05',
                backdrop: 'https://image.tmdb.org/t/p/w1280/4fUvjG5p10u4lH4Yl37yN3H0m5.jpg',
                image: 'https://image.tmdb.org/t/p/w500/fR90T1o6b0hL1uN3H0m5r0m8b2.jpg'
            },
            {
                id: 101881,
                type: 'tv',
                title: 'Arremesso Final',
                overview: 'Esta série documental repleta de imagens inéditas da temporada 1997-98 retrata a carreira de Michael Jordan e a trajetória do Chicago Bulls na década de 1990.',
                vote_average: 8.8,
                release_date: '2020-04-19',
                backdrop: 'https://image.tmdb.org/t/p/w1280/h9YvIuH54cE7Vb8d9e0f1.jpg',
                image: 'https://image.tmdb.org/t/p/w500/xxvd5w6YjC3d0K8t1v9.jpg'
            }
        ]
    }
];

const app = express();
const PORT = process.env.PORT || 3001;

// Permite o APK (origem Capacitor) verificar o servidor na rede local.
// Não altera o HTML/CSS/JS da web nem do desktop.
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// Servir arquivos estáticos (HTML, CSS, JS) da pasta 'public'
const publicPath = __dirname.includes('app.asar')
    ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'public')
    : path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Rate limiting — protege as APIs externas e o servidor de abuso
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // janela de 1 minuto
    max: 100,            // máx. 100 pedidos por IP por minuto
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados pedidos. Tente novamente em breve.' }
});

const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // janela de 1 minuto
    max: 30,             // busca: máx. 30 pedidos por IP por minuto
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados pedidos de busca. Aguarde um momento.' }
});

app.use('/api/', apiLimiter);
app.use('/api/search', searchLimiter);


let cachedTmdbRows = null;
let lastTmdbFetch = 0;
const TMDB_CACHE_TTL = 15 * 60 * 1000; // 15 minutos

// Helper para buscar filmes e séries do TMDB com cache
async function fetchTmdbRows() {
    const now = Date.now();
    if (cachedTmdbRows && (now - lastTmdbFetch < TMDB_CACHE_TTL)) {
        return cachedTmdbRows;
    }

    const { key: tmdbKey, token: tmdbToken, hasKey, hasToken } = getTmdbAuth();

    if (!hasKey && !hasToken) {
        return DEFAULT_CONTENT;
    }

    const config = {};
    const commonParams = {
        language: 'pt-BR',
        watch_region: 'BR',
        page: 1
    };

    if (hasToken) {
        config.headers = { Authorization: `Bearer ${tmdbToken}` };
        config.params = { ...commonParams };
    } else {
        config.params = { api_key: tmdbKey, ...commonParams };
    }

    const endpoints = [
        { title: 'Bombando Hoje', url: 'https://api.themoviedb.org/3/trending/all/day', params: {} },
        { title: 'Lançamentos na Netflix', url: 'https://api.themoviedb.org/3/discover/movie', params: { sort_by: 'primary_release_date.desc', 'primary_release_date.lte': new Date().toISOString().split('T')[0], 'vote_count.gte': 8, with_watch_providers: '8' } },
        { title: 'Filmes em Cartaz', url: 'https://api.themoviedb.org/3/movie/now_playing', params: {} },
        { title: 'Séries em Alta', url: 'https://api.themoviedb.org/3/discover/tv', params: { sort_by: 'popularity.desc' } },
        { title: 'Filmes Populares', url: 'https://api.themoviedb.org/3/discover/movie', params: { sort_by: 'popularity.desc' } },
        { title: 'Ação e Aventura', url: 'https://api.themoviedb.org/3/discover/movie', params: { sort_by: 'popularity.desc', with_genres: '28' } },
        { title: 'Documentários & Fatos', url: 'https://api.themoviedb.org/3/discover/movie', params: { sort_by: 'popularity.desc', with_genres: '99' } }
    ];

    try {
        const requests = endpoints.map((ep) =>
            axios.get(ep.url, {
                headers: config.headers,
                params: { ...config.params, ...ep.params },
                timeout: 5000
            }).catch(err => {
                console.warn(`Aviso ao buscar endpoint ${ep.title}:`, err.message);
                return { data: { results: [] } };
            })
        );

        const responses = await Promise.all(requests);

        const formatItem = (item, type) => ({
            id: item.id,
            type,
            title: item.title || item.name,
            overview: item.overview || 'Sinopse não disponível no momento.',
            vote_average: item.vote_average ? Number(item.vote_average.toFixed(1)) : 7.5,
            release_date: item.release_date || item.first_air_date || '2025',
            backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null),
            image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null
        });

        const rows = responses.map((resData, index) => {
            const ep = endpoints[index];
            const type = ep.url.includes('/tv') ? 'tv' : 'movie';
            const items = (resData.data.results || [])
                .filter((m) => (m.poster_path || m.backdrop_path) && (m.title || m.name))
                .map((m) => formatItem(m, type));
            return { title: ep.title, items, type };
        }).filter(row => row.items.length > 0);

        if (rows.length > 0) {
            cachedTmdbRows = rows;
            lastTmdbFetch = now;
            return rows;
        }
    } catch (err) {
        console.warn('Erro ao carregar TMDB, usando catálogo padrão:', err.message);
    }

    if (cachedTmdbRows && cachedTmdbRows.length > 0) {
        return cachedTmdbRows;
    }

    return DEFAULT_CONTENT;
}

// API Route: Retorna canais da API Reidos ou canais populares em destaque
app.get('/api/channels', async (req, res) => {
    try {
        const rows = await fetchReidosChannels();
        res.json({ rows: rows || [] });
    } catch (e) {
        res.json({ rows: [] });
    }
});

// API Route: Retorna partidas de esportes ao vivo
app.get('/api/sports', async (req, res) => {
    try {
        const rows = await fetchReidosSports();
        res.json({ rows: rows || [] });
    } catch (e) {
        res.json({ rows: [] });
    }
});

// API Route: Retorna catálogo principal (Filmes e Séries TMDB)
app.get('/api/content', async (req, res) => {
    try {
        const rows = await fetchTmdbRows();
        return res.json({ rows });
    } catch (error) {
        console.error('Erro na API de conteúdo:', error.response ? error.response.data : error.message);
        return res.status(500).json({ error: 'Falha ao buscar dados de conteúdo', rows: [] });
    }
});

// API Route: Busca universal (TMDB multi-search + canais + esportes)
// API Route: Retorna detalhes de uma serie, incluindo temporadas e episodios
app.get('/api/tv/:id/seasons', async (req, res) => {
    const { id } = req.params;
    const { key: tmdbKey, token: tmdbToken, hasKey, hasToken } = getTmdbAuth();

    if (!hasKey && !hasToken) {
        return res.status(401).json({ error: 'TMDB nao configurado' });
    }

    try {
        const config = { params: { language: 'pt-BR' }, timeout: 5000 };
        if (hasToken) {
            config.headers = { Authorization: `Bearer ${tmdbToken}` };
        } else {
            config.params.api_key = tmdbKey;
        }

        const tvResponse = await axios.get(`https://api.themoviedb.org/3/tv/${id}`, config);
        const seasons = tvResponse.data.seasons || [];
        res.json({ seasons });
    } catch (err) {
        console.error('Erro ao buscar temporadas:', err.message);
        res.status(500).json({ error: 'Erro ao buscar temporadas' });
    }
});

app.get('/api/tv/:id/season/:season_number', async (req, res) => {
    const { id, season_number } = req.params;
    const { key: tmdbKey, token: tmdbToken, hasKey, hasToken } = getTmdbAuth();

    if (!hasKey && !hasToken) {
        return res.status(401).json({ error: 'TMDB nao configurado' });
    }

    try {
        const config = { params: { language: 'pt-BR' }, timeout: 5000 };
        if (hasToken) {
            config.headers = { Authorization: `Bearer ${tmdbToken}` };
        } else {
            config.params.api_key = tmdbKey;
        }

        const response = await axios.get(`https://api.themoviedb.org/3/tv/${id}/season/${season_number}`, config);
        res.json(response.data);
    } catch (err) {
        console.error('Erro ao buscar episodios:', err.message);
        res.status(500).json({ error: 'Erro ao buscar episodios' });
    }
});

// API Route: Retorna filmes/séries similares (para sugestões no modal)
app.get('/api/similar/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const { key: tmdbKey, token: tmdbToken, hasKey, hasToken } = getTmdbAuth();

    if (!hasKey && !hasToken) {
        return res.json({ results: [] });
    }

    try {
        const config = { params: { language: 'pt-BR', page: 1 }, timeout: 5000 };
        if (hasToken) {
            config.headers = { Authorization: `Bearer ${tmdbToken}` };
        } else {
            config.params.api_key = tmdbKey;
        }

        const mediaType = (type === 'tv' || type === 'serie') ? 'tv' : 'movie';
        const response = await axios.get(`https://api.themoviedb.org/3/${mediaType}/${id}/similar`, config);
        const results = (response.data.results || [])
            .filter(item => item.poster_path || item.backdrop_path)
            .slice(0, 12)
            .map(item => ({
                id: item.id,
                type: mediaType,
                title: item.title || item.name,
                overview: item.overview || '',
                vote_average: item.vote_average ? Number(item.vote_average.toFixed(1)) : 0,
                release_date: item.release_date || item.first_air_date || '',
                image: item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null,
                backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
                runtime: item.runtime || null
            }));

        res.json({ results });
    } catch (err) {
        console.error('Erro ao buscar similares:', err.message);
        res.json({ results: [] });
    }
});

app.get('/api/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) {
        return res.json({ results: [] });
    }

    const { key: tmdbKey, token: tmdbToken, hasKey, hasToken } = getTmdbAuth();

    let tmdbResults = [];

    if (hasKey || hasToken) {
        try {
            const config = {
                params: {
                    query: q,
                    language: 'pt-BR',
                    page: 1,
                    include_adult: false
                },
                timeout: 3500
            };
            if (hasToken) {
                config.headers = { Authorization: `Bearer ${tmdbToken}` };
            } else {
                config.params.api_key = tmdbKey;
            }

            const response = await axios.get('https://api.themoviedb.org/3/search/multi', config);
            tmdbResults = (response.data.results || [])
                .filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && (item.poster_path || item.backdrop_path))
                .map(item => ({
                    id: item.id,
                    type: item.media_type,
                    title: item.title || item.name,
                    overview: item.overview || 'Sinopse não disponível.',
                    vote_average: item.vote_average ? Number(item.vote_average.toFixed(1)) : 7.0,
                    release_date: item.release_date || item.first_air_date || '',
                    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
                    image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null
                }));
        } catch (err) {
            console.warn('Erro ao buscar no TMDB:', err.message);
        }
    }

    // Também buscar em canais e esportes
    const [channelsRows, sportsRows] = await Promise.all([
        fetchReidosChannels().catch(() => []),
        fetchReidosSports().catch(() => [])
    ]);

    const qLower = q.toLowerCase();
    const liveMatches = channelsRows.flatMap(r => r.items || []).filter(c => 
        (c.title && c.title.toLowerCase().includes(qLower)) ||
        (c.category && c.category.toLowerCase().includes(qLower))
    );

    const sportsMatches = sportsRows.flatMap(r => r.items || []).filter(s =>
        (s.title && s.title.toLowerCase().includes(qLower)) ||
        (s.category && s.category.toLowerCase().includes(qLower))
    );

    res.json({
        query: q,
        results: {
            media: tmdbResults,
            channels: liveMatches,
            sports: sportsMatches
        }
    });
});

// API Route: Notificações de novos lançamentos e novidades
app.get('/api/notifications', async (req, res) => {
    try {
        const rows = await fetchTmdbRows();
        const lancamentos = rows.find(r => r.title.includes('Lançamentos') || r.title.includes('Filmes')) || rows[0];
        const series = rows.find(r => r.title.includes('Séries')) || rows[1];

        const notifications = [];

        if (lancamentos && lancamentos.items) {
            lancamentos.items.slice(0, 4).forEach((item, idx) => {
                notifications.push({
                    id: `notif-movie-${item.id}`,
                    title: `Novo Filme Adicionado: ${item.title}`,
                    description: item.overview ? item.overview.slice(0, 90) + '...' : 'Já disponível para assistir com alta qualidade.',
                    image: item.image || item.backdrop,
                    time: `${idx * 2 + 1}h atrás`,
                    item
                });
            });
        }

        if (series && series.items) {
            series.items.slice(0, 3).forEach((item, idx) => {
                notifications.push({
                    id: `notif-tv-${item.id}`,
                    title: `Nova Série em Alta: ${item.title}`,
                    description: item.overview ? item.overview.slice(0, 90) + '...' : 'Episódios em alta definição adicionados.',
                    image: item.image || item.backdrop,
                    time: `${idx * 4 + 3}h atrás`,
                    item
                });
            });
        }

        res.json({ notifications });
    } catch (e) {
        res.json({ notifications: [] });
    }
});

// API Route: Player local — sem popups, sem novas abas, sem overlays de anúncios
// Serve o embed externo dentro de uma página HTML nossa (localhost), com scripts
// que bloqueiam window.open, links _blank, redirecionamentos e ad-networks conhecidas.
app.get('/api/player/:type/:id', (req, res) => {
    const { type, id } = req.params;
    const server = req.query.server || '1';
    const season = req.query.season || '';
    const episode = req.query.episode || '';
    const isSerie = type === 'tv';

    const embedUrls = {
        '1': isSerie ? `https://myembed.biz/serie/${id}/${season}/${episode}`               : `https://myembed.biz/filme/${id}`,
        '2': isSerie ? `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`         : `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
        '3': isSerie ? `https://embed.su/embed/tv/${id}/${season}/${episode}`                : `https://embed.su/embed/movie/${id}`,
        '4': isSerie ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}` : `https://multiembed.mov/?video_id=${id}&tmdb=1`
    };
    const embedUrl = embedUrls[server] || embedUrls['1'];

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe#np-player{position:fixed;top:0;left:0;width:100%;height:100%;border:none;background:#000}
div[class*="overlay"]:not([class*="player"]):not([class*="video"]),
div[id*="overlay"]:not([id*="player"]):not([id*="video"]),
div[class*="popup"],div[id*="popup"],
div[class*="popit"],div[id*="popit"],
[class*="ad-container"],[id*="ad-container"],
[class*="advertisement"],[id*="advertisement"],
ins.adsbygoogle{display:none!important;pointer-events:none!important}
</style>
</head>
<body>
<iframe id="np-player"
    src="${embedUrl}"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowfullscreen>
</iframe>
<script>
(function(){
'use strict';
/* ── 1. Bloquear window.open ─────────────────── */
var _no=function(){return{focus:function(){},close:function(){},document:{}}};
try{Object.defineProperty(window,'open',{value:_no,writable:false,configurable:false})}
catch(e){window.open=_no}

/* ── 2. Isolar frame do pai ──────────────────── */
try{Object.defineProperty(window,'top',{get:function(){return window}})}catch(e){}
try{Object.defineProperty(window,'parent',{get:function(){return window}})}catch(e){}

/* ── 3. Bloquear links _blank / _top ao clique ─ */
document.addEventListener('click',function(e){
  var el=e.target;
  while(el&&el.tagName!=='A')el=el.parentElement;
  if(!el)return;
  var t=(el.getAttribute('target')||'').toLowerCase();
  if(t==='_blank'||t==='_top'||t==='_parent'||t==='_new'){
    e.preventDefault();e.stopImmediatePropagation();
  }
},true);

/* ── 4. Bloquear window.open no iframe do player */
var pf=document.getElementById('np-player');
if(pf){
  pf.addEventListener('load',function(){
    try{
      var fw=pf.contentWindow;
      if(fw){fw.open=_no;try{Object.defineProperty(fw,'open',{value:_no,writable:false})}catch(e){}}
    }catch(e){}
  });
}

/* ── 5. Observer: bloquear scripts de ad-networks e iframes dinâmicos ── */
var AD_NETS=['googlesyndication','doubleclick','adnxs','popads','popcash',
             'exoclick','trafficjunky','propellerads','monetag','adsterra'];
var mo=new MutationObserver(function(muts){
  muts.forEach(function(m){
    m.addedNodes.forEach(function(node){
      if(!node.tagName)return;
      if(node.tagName==='SCRIPT'&&AD_NETS.some(function(n){return(node.src||'').includes(n)})){
        node.type='text/plain'; /* impede execução */
      }
      if(node.tagName==='IFRAME'){
        node.addEventListener('load',function(){
          try{if(node.contentWindow)node.contentWindow.open=_no}catch(e){}
        });
      }
    });
  });
});
mo.observe(document.documentElement,{childList:true,subtree:true});

/* ── 6. Remover overlays de anúncios após carregamento ─────────────── */
window.addEventListener('load',function(){
  setTimeout(function(){
    ['[class*="pop"]','[id*="pop"]','[class*="banner-ad"]',
     'ins.adsbygoogle','[class*="preroll"]','[class*="interstitial"]',
     '[class*="adsense"]','[id*="adsense"]'].forEach(function(sel){
      try{document.querySelectorAll(sel).forEach(function(el){
        el.style.cssText='display:none!important;pointer-events:none!important';
      })}catch(e){}
    });
  },1200);
});

})();
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(html);
});

// Cache de trailers com TTL (1 hora) e limite máximo de entradas (500)
// Evita crescimento ilimitado de memória em sessões longas
class TtlCache {
    constructor(maxSize = 500, ttlMs = 60 * 60 * 1000) {
        this.store = new Map();
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }
    has(key) {
        const entry = this.store.get(key);
        if (!entry) return false;
        if (Date.now() - entry.ts > this.ttlMs) {
            this.store.delete(key);
            return false;
        }
        return true;
    }
    get(key) {
        return this.has(key) ? this.store.get(key).value : undefined;
    }
    set(key, value) {
        if (this.store.size >= this.maxSize) {
            // Remover a entrada mais antiga (primeira inserida)
            this.store.delete(this.store.keys().next().value);
        }
        this.store.set(key, { value, ts: Date.now() });
    }
}

const trailerCache = new TtlCache(500, 60 * 60 * 1000); // 500 entradas, TTL 1 hora

// API Route: Retorna o trailer de um filme ou série do TMDB
app.get('/api/trailer/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const cacheKey = `${type}-${id}`;
    if (trailerCache.has(cacheKey)) {
        return res.json(trailerCache.get(cacheKey));
    }


    const { key: tmdbKey, token: tmdbToken, hasKey, hasToken } = getTmdbAuth();

    if (!hasKey && !hasToken) {
        return res.json({ key: null });
    }

    try {
        const config = { params: { language: 'pt-BR' }, timeout: 3000 };
        if (hasToken) {
            config.headers = { Authorization: `Bearer ${tmdbToken}` };
        } else {
            config.params.api_key = tmdbKey;
        }

        let response = await axios.get(`https://api.themoviedb.org/3/${type}/${id}/videos`, config);
        let videos = response.data.results || [];

        // Se não houver trailer em pt-BR, busca em en-US como fallback
        if (videos.length === 0) {
            config.params.language = 'en-US';
            response = await axios.get(`https://api.themoviedb.org/3/${type}/${id}/videos`, config).catch(() => ({ data: { results: [] } }));
            videos = response.data.results || [];
        }
        
        // Procurar por um trailer oficial no YouTube
        let trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official);
        if (!trailer) {
            trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer');
        }
        if (!trailer) {
            trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Teaser' || v.type === 'Clip'));
        }
        if (!trailer && videos.length > 0) {
            trailer = videos.find(v => v.site === 'YouTube');
        }

        const result = { key: trailer ? trailer.key : null };
        trailerCache.set(cacheKey, result);
        res.json(result);

    } catch (error) {
        console.error(`Erro ao buscar trailer para ${type} ID ${id}:`, error.message);
        res.json({ key: null });
    }
});

// API Route: Retorna informações de rede local e QR Code para acesso no telemóvel
app.get('/api/network-info', async (req, res) => {
    try {
        const localIp = getLocalIpAddress();
        const networkUrl = `http://${localIp}:${PORT}`;
        const qrCode = await QRCode.toDataURL(networkUrl, {
            width: 260,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });

        res.json({
            localIp,
            port: PORT,
            networkUrl,
            localUrl: `http://localhost:${PORT}`,
            qrCode
        });
    } catch (e) {
        console.error('Erro ao gerar QR Code:', e);
        res.status(500).json({ error: 'Erro ao gerar QR Code' });
    }
});

// Iniciar servidor em 0.0.0.0 (acessível na rede local / telemóvel)
const server = app.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`\n=================================`);
    console.log(`🎬 Servidor NetProfiles Iniciado!`);
    console.log(`=================================`);
    console.log(`🌐 Acesso Local:        http://localhost:${PORT}`);
    console.log(`📱 Acesso no Telemóvel: http://${localIp}:${PORT}`);
    console.log(`=================================\n`);
});

server.on('error', (e) => {
    console.error('Erro ao iniciar o servidor:', e);
});

// Exportar para Electron
app.server = server;
module.exports = app;


