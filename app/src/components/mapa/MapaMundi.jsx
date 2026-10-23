import React, { useState, useRef, useEffect, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { useMapaForm, urlSeguraParaCss } from './MapaFormContext';
import { salvarCenarioCompleto, uploadImagem } from '../../services/firebase-sync';

// 🔥 AS IMAGENS DO MUNDO MATERIAL 🔥
import mapaClean from '../../assets/runeterra-clean.jpg';
import gabaritoFreljord from '../../assets/gabarito-freijord.png';
import gabaritoDemacia from '../../assets/gabarito-demacia.png';
import gabaritoNoxus from '../../assets/gabarito-noxus.png';
import gabaritoPiltover from '../../assets/gabarito-piltover.png';
import gabaritoShurima from '../../assets/gabarito-shurima.png';
import gabaritoTargon from '../../assets/gabarito-targon.png';
import gabaritoIxtal from '../../assets/gabarito-ixtal.png';
import gabaritoAguas from '../../assets/gabarito-aguas.png';
import gabaritoIlha from '../../assets/gabarito-ilha.png';
import gabaritoIonia from '../../assets/gabarito-ionia.png';
import mapaCosmologia from '../../assets/mapa-cosmologia.png';
import { segmentosDoOito, amostrarTrilha, escolherFases, atrasoDaFase } from '../../core/orbitasUniverso';

export default function MapaMundi({ children }) {
    const cenario = useStore(s => s.cenario);
    // 🔥 Acessa o mesmo contexto do Gerenciador de Cenas (MapaFerramentasMestre) — MapaMundi é
    // renderizado dentro do MapaFormProvider (via MapaAreaCentral), então dá pra ler qual cena
    // está publicada/sendo visualizada e pular direto pra ela, sem depender de o jogador navegar
    // manualmente por todo o mapa cósmico. Retorna null se usado fora do provider (ex: testes).
    const ctxMapa = useMapaForm();

    const [nivelVisao, setNivelVisao] = useState('sistema_solar');
    const [localAtual, setLocalAtual] = useState({ continente: null, reino: null, mapaId: null, plano: 'Material' });

    // 🔥 Sincroniza com a Cena publicada/visualizada pelo Mestre: sem isso, "Publicar para Todos"
    // e "Ver Cena Oculta" no Gerenciador de Cenas mudavam o estado global (cenario.ativa /
    // cenaVisualizadaId) mas NINGUÉM via a mudança — o mapa de batalha (children: grelha/tokens)
    // só é renderizado quando nivelVisao === 'reino', e nada aqui reagia a essas mudanças.
    useEffect(() => {
        const cenaRenderId = ctxMapa?.cenaRenderId;
        if (!cenaRenderId) return;
        setLocalAtual(prev => {
            if (prev.mapaId === cenaRenderId) return prev; // já estamos nela, preserva reino/mapaNome
            return { ...prev, reino: null, mapaId: cenaRenderId, mapaNome: ctxMapa?.cenaAtual?.nome || '' };
        });
        setNivelVisao('reino');
    }, [ctxMapa?.cenaRenderId]);

    // 🔥 O NOVO CÉREBRO LOCAL (BLINDADO CONTRA ERROS DE MEMÓRIA) 🔥
    const [atlas, setAtlas] = useState(() => {
        try {
            const salvo = localStorage.getItem('rpg_atlas_mundi');
            return salvo ? JSON.parse(salvo) : {};
        } catch (e) {
            console.error("Erro ao ler o Atlas do Mundo", e);
            return {};
        }
    });

    const salvarAtlas = (novoAtlas) => {
        try {
            localStorage.setItem('rpg_atlas_mundi', JSON.stringify(novoAtlas));
            setAtlas(novoAtlas);
        } catch (e) {
            alert("⚠️ ERRO DE MEMÓRIA: A imagem que você fez upload é muito pesada para o navegador salvar. Por favor, cole a URL (Link) da imagem na Opção 2 em vez de enviar o arquivo do PC!");
            console.error("Erro de Quota Excedida", e);
        }
    };

    const [reinoSelecionado, setReinoSelecionado] = useState(null);
    const [modoEdicaoMapa, setModoEdicaoMapa] = useState(false);
    const [criandoMapa, setCriandoMapa] = useState(false);
    const [novoMapaNome, setNovoMapaNome] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [salvandoCenario, setSalvandoCenario] = useState(false);
    const [reinoHover, setReinoHover] = useState(null); 
    const [planoHover, setPlanoHover] = useState(null);
    const [rotacaoGlobo, setRotacaoGlobo] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    const [modoAjuste, setModoAjuste] = useState(false);
    const [dragIndexCosmo, setDragIndexCosmo] = useState(null);
    const containerRef = useRef(null);
    const [codigoExportado, setCodigoExportado] = useState(null);

    // CÂMERA 3D DO SISTEMA SOLAR 
    const [camRotX, setCamRotX] = useState(60); 
    const [camRotY, setCamRotY] = useState(0);  
    const [isDraggingCam, setIsDraggingCam] = useState(false);
    const camDragStart = useRef({ x: 0, y: 0 });

    // ANIMAÇÃO DE VOO 
    const [voandoPara, setVoandoPara] = useState(null);
    const [flashBranco, setFlashBranco] = useState(false);

    // POSIÇÕES DA COSMOLOGIA 
    const [zonasCosmologia, setZonasCosmologia] = useState([
        { "nome": "Terra 0 (Runeterra)", "top": "44.3%", "left": "49.3%", "width": "10%", "height": "16.6%", "cor": "#ffffff", "isCircle": true, "isPlanet": true },
        { "nome": "Plano da Ordem", "top": "40.6%", "left": "13.2%", "width": "13%", "height": "22%", "cor": "#DDA0DD", "isCircle": true },
        { "nome": "Plano Astral", "top": "38.7%", "left": "81.9%", "width": "13%", "height": "22%", "cor": "#483D8B", "isCircle": true },
        { "nome": "Plano do Vento", "top": "28.2%", "left": "33.4%", "width": "12%", "height": "20%", "cor": "#2E8B57", "isCircle": true },
        { "nome": "Plano do Fogo", "top": "55.2%", "left": "34.1%", "width": "12%", "height": "20%", "cor": "#DC143C", "isCircle": true },
        { "nome": "Plano da Água", "top": "26.6%", "left": "62.4%", "width": "12%", "height": "20%", "cor": "#4169E1", "isCircle": true },
        { "nome": "Plano da Terra", "top": "56.7%", "left": "63.6%", "width": "12%", "height": "20%", "cor": "#8B4513", "isCircle": true },
        { "nome": "Céus", "top": "2.4%", "left": "47.0%", "width": "12%", "height": "18%", "cor": "#FCE883", "isCircle": true },
        { "nome": "Inferno", "top": "79.2%", "left": "46.7%", "width": "16%", "height": "14%", "cor": "#FF4500", "isCircle": false },
        { "nome": "Plano das Fadas", "top": "32.4%", "left": "50.3%", "width": "7%", "height": "9%", "cor": "#32CD32", "isCircle": true },
        { "nome": "Plano do Éter", "top": "64.7%", "left": "50.7%", "width": "7%", "height": "9%", "cor": "#9400D3", "isCircle": true },
        { "nome": "Plano do Caos", "top": "2.1%", "left": "77.5%", "width": "22%", "height": "10%", "cor": "#800000", "isCircle": false },
        { "nome": "Plano do Caos Inferior", "top": "84%", "left": "8%", "width": "22%", "height": "10%", "cor": "#800000", "isCircle": false }
    ]);

    // ESTRELAS E PLANETAS 
    const [elementosSolar, setElementosSolar] = useState([
        { "id": "orichalcosA", "tipo": "estrela", "nome": "Orichalcos A", "top": "250px", "left": "250px", "size": "180px" },
        { "id": "orichalcosB", "tipo": "estrela", "nome": "Orichalcos B", "top": "250px", "left": "750px", "size": "180px" },
        { "id": "vegeta", "tipo": "planeta", "nome": "Vegeta", "color1": "#ff6666", "color2": "#990000", "shadow": "rgba(255,0,0,0.5)", "size": "45px", "tempo": "60s", "delay": "-5s", "pathIdx": 1 },
        { "id": "namekusei", "tipo": "planeta", "nome": "Namekusei", "color1": "#66ff66", "color2": "#006600", "shadow": "rgba(0,255,0,0.5)", "size": "50px", "tempo": "60s", "delay": "-20s", "pathIdx": 2 },
        { "id": "desconhecido", "tipo": "planeta", "nome": "Desconhecido", "color1": "#66b3ff", "color2": "#000066", "shadow": "rgba(0,100,255,0.5)", "size": "40px", "tempo": "60s", "delay": "-45s", "pathIdx": 3 },
        { "id": "terra0", "tipo": "terra", "nome": "Terra 0", "size": "110px", "tempo": "60s", "delay": "0s", "pathIdx": 0 }
    ]);

    const [configOrbitas, setConfigOrbitas] = useState({
        "terra0": { rx: 270, ry: 360 },
        "vegeta": { rx: 325, ry: 400 },
        "namekusei": { rx: 215, ry: 300 },
        "desconhecido": { rx: 380, ry: 440 }
    });

    const posicoesPings = [
        { nome: 'Freljord', img: gabaritoFreljord, top: '15%', left: '28%', cor: '#00b5e2' },
        { nome: 'Demacia', img: gabaritoDemacia, top: '40%', left: '21%', cor: '#d3c29e' },
        { nome: 'Noxus', img: gabaritoNoxus, top: '28%', left: '48%', cor: '#c62828' }, 
        { nome: 'Piltover e Zaun', img: gabaritoPiltover, top: '54%', left: '51%', cor: '#d4a017' },
        { nome: 'Shurima', img: gabaritoShurima, top: '75%', left: '43%', cor: '#c59b0d' },
        { nome: 'Targon', img: gabaritoTargon, top: '78%', left: '26%', cor: '#5e35b1' },
        { nome: 'Ixtal', img: gabaritoIxtal, top: '67%', left: '63%', cor: '#2e7d32' },
        { nome: 'Águas de Sentina', img: gabaritoAguas, top: '57%', left: '72%', cor: '#d84315' },
        { nome: 'Ilha das Sombras', img: gabaritoIlha, top: '86%', left: '85%', cor: '#00838f' },
        { nome: 'Ionia', img: gabaritoIonia, top: '30%', left: '82%', cor: '#43a047' }
    ];

    // GERADOR MATEMÁTICO DA RODOVIA CÓSMICA
    const getPathCaminho = (rx, ry) => {
        const starA = elementosSolar.find(e => e.id === 'orichalcosA');
        const starB = elementosSolar.find(e => e.id === 'orichalcosB');
        const posAx = parseInt(starA.left); const posAy = parseInt(starA.top);
        const posBx = parseInt(starB.left); const posBy = parseInt(starB.top);
        const cx = (posAx + posBx) / 2; const cy = (posAy + posBy) / 2;
        const distEstrelas = Math.abs(posBx - posAx) / 2;
        const raioX = distEstrelas + rx;
        return `M ${cx} ${cy} C ${cx + raioX*0.375} ${cy - ry}, ${cx + raioX} ${cy - ry*0.75}, ${cx + raioX} ${cy} C ${cx + raioX} ${cy + ry*0.75}, ${cx + raioX*0.375} ${cy + ry}, ${cx} ${cy} C ${cx - raioX*0.375} ${cy - ry}, ${cx - raioX} ${cy - ry*0.75}, ${cx - raioX} ${cy} C ${cx - raioX} ${cy + ry*0.75}, ${cx - raioX*0.375} ${cy + ry}, ${cx} ${cy} Z`;
    };

    const caminhosGerados = {
        "terra0": getPathCaminho(configOrbitas.terra0.rx, configOrbitas.terra0.ry),
        "vegeta": getPathCaminho(configOrbitas.vegeta.rx, configOrbitas.vegeta.ry),
        "namekusei": getPathCaminho(configOrbitas.namekusei.rx, configOrbitas.namekusei.ry),
        "desconhecido": getPathCaminho(configOrbitas.desconhecido.rx, configOrbitas.desconhecido.ry)
    };

    // 🪐 Órbitas organizadas (core/orbitasUniverso.js): todos giram no mesmo ritmo e cada astro parte do ponto da trilha que o
    // mantém mais longe dos outros durante a volta toda; nada se cruza no centro do "oito" nem passa por dentro de outro astro.
    const atrasosOrbitais = useMemo(() => {
        const starA = elementosSolar.find(e => e.id === 'orichalcosA');
        const starB = elementosSolar.find(e => e.id === 'orichalcosB');
        const cx = (parseInt(starA.left) + parseInt(starB.left)) / 2;
        const cy = (parseInt(starA.top) + parseInt(starB.top)) / 2;
        const distEstrelas = Math.abs(parseInt(starB.left) - parseInt(starA.left)) / 2;
        const corpos = elementosSolar.filter(e => e.tipo !== 'estrela' && configOrbitas[e.id]).map(e => ({
            id: e.id,
            trilha: amostrarTrilha(segmentosDoOito(cx, cy, distEstrelas + configOrbitas[e.id].rx, configOrbitas[e.id].ry)),
            periodo: e.tempo,
            // A Terra conta com o anel das luas (raio ~ 110% do tamanho dela).
            raio: e.tipo === 'terra' ? parseInt(e.size) * 1.15 : (parseInt(e.size) || 40) / 2
        }));
        const fases = escolherFases(corpos, { candidatos: 96 });
        const porId = {};
        corpos.forEach(c => { porId[c.id] = atrasoDaFase(fases[c.id] || 0, c.periodo); });
        return porId;
    }, [elementosSolar, configOrbitas]);

    // SISTEMA DE NAVEGAÇÃO / VOO
    const iniciarViagem = (nomeDestino, acao) => {
        if (modoAjuste) return;
        setVoandoPara(nomeDestino);
        setTimeout(() => setFlashBranco(true), 1200);
        setTimeout(() => {
            if (typeof acao === 'function') acao(); 
            else if (acao) setNivelVisao(acao); 
            else alert(`Oculto pelas névoas.\nAcesso restrito a: ${nomeDestino}`);
            setVoandoPara(null); setFlashBranco(false);
        }, 1500);
    };

    // CONTROLES DA CÂMERA ESPACIAL
    const handleEspacoMouseDown = (e) => {
        if (e.target.closest('.painel-engenharia') || voandoPara || modoAjuste) return;
        setIsDraggingCam(true);
        camDragStart.current = { x: e.clientX || e.touches?.[0].clientX, y: e.clientY || e.touches?.[0].clientY };
    };
    const handleEspacoMouseMove = (e) => {
        if (!isDraggingCam || voandoPara) return;
        const clientX = e.clientX || e.touches?.[0].clientX;
        const clientY = e.clientY || e.touches?.[0].clientY;
        const diffX = clientX - camDragStart.current.x;
        const diffY = clientY - camDragStart.current.y;
        setCamRotY(prev => prev + diffX * 0.5);
        setCamRotX(prev => Math.max(10, Math.min(85, prev - diffY * 0.5))); 
        camDragStart.current = { x: clientX, y: clientY };
    };
    const handleEspacoMouseUp = () => setIsDraggingCam(false);

    const voltarCamera = () => {
        if (nivelVisao === 'reino') setNivelVisao('continente');
        else if (nivelVisao === 'continente') setNivelVisao('globo');
        else if (nivelVisao === 'globo') setNivelVisao('sistema_solar');
        else if (nivelVisao === 'cosmologia') setNivelVisao('sistema_solar');
    };

    // FUNÇÕES GLOBO
    const handleGloboDragStart = (e) => { setIsDragging(true); dragStart.current = { x: e.clientX || e.touches?.[0].clientX, y: e.clientY || e.touches?.[0].clientY }; };
    const handleGloboDragMove = (e) => {
        if (!isDragging) return;
        const diffX = (e.clientX || e.touches?.[0].clientX) - dragStart.current.x;
        const diffY = (e.clientY || e.touches?.[0].clientY) - dragStart.current.y;
        setRotacaoGlobo({ x: rotacaoGlobo.x + diffX * 0.4, y: Math.max(-70, Math.min(70, rotacaoGlobo.y - diffY * 0.4)) });
        dragStart.current = { x: e.clientX || e.touches?.[0].clientX, y: e.clientY || e.touches?.[0].clientY };
    };
    const handleGloboDragEnd = () => setIsDragging(false);

    // MODO DEUS (Cosmologia)
    const handleDragStartCosmo = (e, index) => { if (modoAjuste) { e.stopPropagation(); setDragIndexCosmo(index); } };
    const handleDragMoveCosmo = (e) => {
        if (!modoAjuste || !containerRef.current || dragIndexCosmo === null) return;
        const rect = containerRef.current.getBoundingClientRect();
        let clientX = e.clientX || (e.touches && e.touches[0].clientX);
        let clientY = e.clientY || (e.touches && e.touches[0].clientY);
        if (!clientX || !clientY) return;
        let xPercent = ((clientX - rect.left) / rect.width) * 100;
        let yPercent = ((clientY - rect.top) / rect.height) * 100;
        const w = parseFloat(zonasCosmologia[dragIndexCosmo].width);
        const h = parseFloat(zonasCosmologia[dragIndexCosmo].height);
        setZonasCosmologia(prev => {
            const novas = [...prev];
            novas[dragIndexCosmo] = { ...novas[dragIndexCosmo], top: `${(yPercent - h/2).toFixed(1)}%`, left: `${(xPercent - w/2).toFixed(1)}%` };
            return novas;
        });
    };
    const handleDragEndCosmo = () => { setDragIndexCosmo(null); };

    const gerarCodigoExportacao = () => {
        const codigoCosmo = JSON.stringify(zonasCosmologia, null, 4);
        const codigoSolar = JSON.stringify(elementosSolar, null, 4);
        const codigoOrbs = JSON.stringify(configOrbitas, null, 4);
        setCodigoExportado(`// COPIE E SUBSTITUA A 'zonasCosmologia':\nconst [zonasCosmologia, setZonasCosmologia] = useState(${codigoCosmo});\n\n// ======================================\n\n// COPIE E SUBSTITUA A 'elementosSolar':\nconst [elementosSolar, setElementosSolar] = useState(${codigoSolar});\n\n// ======================================\n\n// COPIE E SUBSTITUA A 'configOrbitas':\nconst [configOrbitas, setConfigOrbitas] = useState(${codigoOrbs});`);
    };

    const PainelEngenhariaSolar = () => {
        if (!modoAjuste || nivelVisao !== 'sistema_solar') return null;
        return (
            <div className="fade-in painel-engenharia" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} style={{ position: 'absolute', right: '20px', top: '80px', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', padding: '20px', borderRadius: '15px', border: '1px solid #0088ff', zIndex: 150, display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '75vh', overflowY: 'auto', width: '300px', boxShadow: '0 0 20px rgba(0,136,255,0.3)' }}>
                <h3 style={{ color: '#fff', margin: '0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '2px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Engenharia Orbital</h3>
                {['terra0', 'vegeta', 'namekusei', 'desconhecido'].map(id => (
                    <div key={id} style={{ marginBottom: '5px', paddingBottom: '10px', borderBottom: '1px dotted #333' }}>
                        <span style={{ color: '#00ffcc', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Órbita: {id}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                            <label style={{ color: '#aaa', fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>Folga Externa (Eixo X) <span>{configOrbitas[id].rx}</span></label>
                            <input type="range" min="0" max="600" step="5" value={configOrbitas[id].rx} onChange={(e) => setConfigOrbitas(prev => ({...prev, [id]: {...prev[id], rx: parseInt(e.target.value)}}))} />
                            <label style={{ color: '#aaa', fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>Altura (Eixo Y) <span>{configOrbitas[id].ry}</span></label>
                            <input type="range" min="50" max="600" step="5" value={configOrbitas[id].ry} onChange={(e) => setConfigOrbitas(prev => ({...prev, [id]: {...prev[id], ry: parseInt(e.target.value)}}))} />
                        </div>
                    </div>
                ))}
                <h3 style={{ color: '#ffcc00', margin: '10px 0 0 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '2px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Estrelas Gêmeas</h3>
                {['orichalcosA', 'orichalcosB'].map(id => {
                    const star = elementosSolar.find(e => e.id === id);
                    return (
                        <div key={id} style={{ marginBottom: '5px', paddingBottom: '10px', borderBottom: '1px dotted #333' }}>
                            <span style={{ color: '#ffcc00', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>{star.nome}</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                <label style={{ color: '#aaa', fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>Posição X (Dir/Esq)</label>
                                <input type="range" min="0" max="1000" step="5" value={parseInt(star.left)} onChange={(e) => setElementosSolar(prev => prev.map(el => el.id === id ? { ...el, left: `${e.target.value}px` } : el))} />
                                <label style={{ color: '#aaa', fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>Posição Y (Cima/Baixo)</label>
                                <input type="range" min="0" max="500" step="5" value={parseInt(star.top)} onChange={(e) => setElementosSolar(prev => prev.map(el => el.id === id ? { ...el, top: `${e.target.value}px` } : el))} />
                            </div>
                        </div>
                    )
                })}
            </div>
        );
    };

    const PainelModoDeus = () => (
        <div style={{ position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '5px', background: 'rgba(0,0,0,0.8)', padding: '10px 20px', borderRadius: '10px', border: '1px solid #333', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                <button onClick={() => setModoAjuste(!modoAjuste)} style={{ background: modoAjuste ? '#ff4444' : '#0088ff', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {modoAjuste ? '❌ DESLIGAR MODO AJUSTE' : '🔧 LIGAR MODO DE AJUSTE'}
                </button>
                {modoAjuste && <button onClick={gerarCodigoExportacao} style={{ background: '#00cc66', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>💾 IMPRIMIR CÓDIGO</button>}
            </div>
        </div>
    );

    // ==========================================
    // 💡 AS NOVAS FUNÇÕES PARA CRIAR E ENTRAR NO MAPA
    // ==========================================
    
    // 🔥 Usa um modal próprio em vez de window.prompt(): o prompt() nativo do navegador
    // não funciona dentro do WebView do App (fica sem resposta ao clicar), só no site.
    const criarNovoMapa = () => {
        setNovoMapaNome('');
        setCriandoMapa(true);
    };

    const confirmarNovoMapa = () => {
        const nome = novoMapaNome.trim();
        if (nome !== "") {
            const novoMapa = { id: `mapa_${Date.now()}`, nome, img: '' };
            const reinoMapas = atlas[reinoSelecionado] || [];
            salvarAtlas({ ...atlas, [reinoSelecionado]: [...reinoMapas, novoMapa] });
        }
        setCriandoMapa(false);
        setNovoMapaNome('');
    };

    const abrirMenuReino = (nomeReino) => setReinoSelecionado(nomeReino);

    const entrarNoMapaDeBatalha = (mapa) => {
        setLocalAtual({ ...localAtual, reino: reinoSelecionado, mapaId: mapa.id, mapaNome: mapa.nome });
        setReinoSelecionado(null);
        setNivelVisao('reino');
        
        // 🔥 A MÁGICA: Força a Grelha a ler esta Cena! 🔥
        // Precisa ir por salvarCenarioCompleto (grava no Firebase) — setCenario() sozinho só muda
        // o estado local deste navegador, então a Cena nunca aparecia pra mais ninguém na mesa.
        // Checar o retorno é essencial aqui: sem isso, uma escrita que falhasse (payload grande
        // demais, conexão instável, regra de segurança) passava batido — a tela mudava pro Mestre,
        // mas a Cena nunca chegava a existir de verdade no Firebase, então ninguém mais a via.
        const cenasLista = { ...cenario.lista };
        cenasLista[mapa.id] = cenasLista[mapa.id]
            ? { ...cenasLista[mapa.id], img: mapa.img || cenasLista[mapa.id].img }
            : { nome: `[${reinoSelecionado}] ${mapa.nome}`, img: mapa.img || '', escala: 1.5, unidade: 'm' };
        salvarCenarioCompleto({ ...cenario, ativa: mapa.id, lista: cenasLista }).then((ok) => {
            if (!ok) alert('⚠️ Não foi possível salvar este mapa no servidor — ele pode não aparecer para os outros jogadores. Verifique sua conexão e tente de novo.');
        });
    };

    const atualizarImagemMapa = (imgUrl) => {
        const reino = localAtual.reino;
        const id = localAtual.mapaId;

        // Atualiza Atlas Local
        const reinoMapas = atlas[reino] || [];
        const novosMapas = reinoMapas.map(m => m.id === id ? { ...m, img: imgUrl } : m);
        salvarAtlas({ ...atlas, [reino]: novosMapas });

        // Atualiza Cena Global (para a Grelha ver a imagem IMEDIATAMENTE)
        const novasCenas = { ...cenario.lista };
        novasCenas[id] = novasCenas[id]
            ? { ...novasCenas[id], img: imgUrl }
            : { nome: `[${reino}] ${localAtual.mapaNome}`, img: imgUrl, escala: 1.5, unidade: 'm' };
        return salvarCenarioCompleto({ ...cenario, ativa: id, lista: novasCenas }).then((ok) => {
            if (ok) {
                setModoEdicaoMapa(false);
            } else {
                alert('⚠️ Não foi possível salvar o fundo deste cenário no servidor — ele pode não aparecer para os outros jogadores. Verifique sua conexão e tente de novo.');
            }
        });
    };

    // 🔥 Sobe a imagem pro Firebase Storage (como o Gerenciador de Cenas já faz) em vez de embutir
    // o arquivo inteiro em base64 direto no Cenário do Firebase — uma foto de alguns MB em base64
    // podia estourar o limite de payload do Realtime Database e falhar em silêncio, fazendo o
    // cenário "sumir" pros outros mesmo com o Mestre vendo tudo certo na própria tela.
    // `salvandoCenario` cobre tanto esse upload quanto a gravação no Firebase de atualizarImagemMapa
    // (e é resetado sempre que o modal "Configurar Cenário" é reaberto — se um upload travar numa
    // rede ruim, fechar e abrir o modal de novo destrava o botão/input em vez de ficar preso pra sempre).
    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setSalvandoCenario(true);
        try {
            const url = await uploadImagem(file, `mapas/${Date.now()}`);
            await atualizarImagemMapa(url);
        } catch (err) {
            alert('Erro ao enviar a imagem para o Mapa. Verifique sua conexão ou tente uma imagem menor.');
        } finally {
            setSalvandoCenario(false);
        }
    };

    const salvarUrl = async () => {
        if (!urlInput) { setModoEdicaoMapa(false); return; }
        setSalvandoCenario(true);
        try {
            await atualizarImagemMapa(urlInput);
        } finally {
            setSalvandoCenario(false);
        }
    };

    // ==========================================
    // 🌌 TELA 0: SISTEMA SOLAR CÂMERA 3D
    // ==========================================
    if (nivelVisao === 'sistema_solar') {
        const billboardTransform = `rotateY(${-camRotY}deg) rotateX(${-camRotX}deg)`;
        return (
            <div className="fade-in" style={{ width: '100%', height: '85vh', background: 'radial-gradient(circle at center, #0a0a1a 0%, #000000 100%)', position: 'relative', overflow: 'hidden', borderRadius: '15px', border: '1px solid #333' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(2px 2px at 20px 30px, #ffffff, rgba(0,0,0,0)), radial-gradient(2px 2px at 40px 70px, #ffffff, rgba(0,0,0,0)), radial-gradient(2px 2px at 90px 40px, #ffffff, rgba(0,0,0,0))', backgroundRepeat: 'repeat', backgroundSize: '200px 200px', opacity: voandoPara ? 0 : 0.3, transition: 'opacity 1s' }} />
                <PainelModoDeus /><PainelEngenhariaSolar />
                <button onClick={() => iniciarViagem('Multiverso', 'cosmologia')} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(72, 61, 139, 0.4)', border: '1px solid #DDA0DD', color: '#DDA0DD', padding: '10px 25px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', zIndex: 100, opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>🌌 REVELAR DIMENSÕES</button>
                <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, pointerEvents: 'none', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>
                    <h2 style={{ color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '4px', textShadow: '0 0 10px #fff' }}>Universo Material</h2>
                    <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0 0 0', letterSpacing: '1px' }}>Setor Orichalcos</p>
                </div>
                <div style={{ position: 'absolute', inset: 0, touchAction: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onMouseDown={handleEspacoMouseDown} onMouseMove={handleEspacoMouseMove} onMouseUp={handleEspacoMouseUp} onMouseLeave={handleEspacoMouseUp} onTouchStart={handleEspacoMouseDown} onTouchMove={handleEspacoMouseMove} onTouchEnd={handleEspacoMouseUp}>
                    <div style={{ position: 'relative', width: '1000px', height: '500px', transformStyle: 'preserve-3d', transform: `perspective(1500px) rotateX(${camRotX}deg) rotateY(${camRotY}deg)`, cursor: isDraggingCam ? 'grabbing' : (modoAjuste ? 'default' : 'grab') }}>
                        <svg viewBox="0 0 1000 500" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 1, opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>
                            <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                            {['terra0', 'vegeta', 'namekusei', 'desconhecido'].map((id) => (
                                <path key={`trilha-${id}`} className="linha-orbita-animada" d={caminhosGerados[id]} fill="none" stroke={id === 'terra0' ? "rgba(255, 255, 255, 0.6)" : "rgba(255, 255, 255, 0.25)"} strokeWidth={id === 'terra0' ? "4" : "2"} strokeDasharray="15 30" filter="url(#glow)" />
                            ))}
                        </svg>
                        {elementosSolar.map(el => {
                            if (el.tipo === 'estrela') {
                                return (
                                    <div key={el.id} style={{ position: 'absolute', top: el.top, left: el.left, width: el.size, height: el.size, zIndex: 5, transform: 'translate(-50%, -50%)', transformStyle: 'preserve-3d', pointerEvents: 'none', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>
                                        <div className="astro-corona" style={{ transform: billboardTransform }} />
                                        <div className="astro-estrela" style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #ffcc00 40%, #ff5500 100%)', boxShadow: '0 0 100px #ffcc00, 0 0 150px #ff5500, inset -20px -20px 40px rgba(255,50,0,0.8)', transform: billboardTransform, transformStyle: 'preserve-3d' }}><span className="astro-textura astro-granulos" /><span className="astro-textura astro-manchas" /><span className="astro-borda astro-borda-estrela" /></div>
                                    </div>
                                );
                            }
                            if (el.tipo === 'planeta') {
                                return (
                                    <div key={el.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', transformStyle: 'preserve-3d' }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, width: el.size, height: el.size, zIndex: voandoPara === el.nome ? 9999 : 10, offsetPath: `path("${caminhosGerados[el.id]}")`, offsetRotate: '0deg', animation: `orbitaSempre ${el.tempo} linear infinite`, animationDelay: atrasosOrbitais[el.id] || el.delay, transformStyle: 'preserve-3d', pointerEvents: 'auto' }}>
                                            <div style={{ width: '100%', height: '100%', transform: voandoPara === el.nome ? `${billboardTransform} scale(40)` : billboardTransform, transition: voandoPara === el.nome ? 'all 1.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none', opacity: voandoPara && voandoPara !== el.nome ? 0 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transformStyle: 'preserve-3d' }}>
                                                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: `radial-gradient(circle at 30% 30%, ${el.color1}, ${el.color2})`, boxShadow: `inset -15px -15px 25px rgba(0,0,0,0.9), inset 5px 5px 15px rgba(255,255,255,0.4), 0 0 20px ${el.shadow}`, zIndex: 10, cursor: 'pointer', '--atm': el.shadow }} className={`astro-esfera astro-${el.id}`} onClick={() => iniciarViagem(el.nome, null)}><span className="astro-textura astro-superficie" /><span className="astro-textura astro-nuvens" /><span className="astro-borda" /></div>
                                                <div style={{ position: 'absolute', width: '140%', height: '140%', borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.2)', pointerEvents: 'none', zIndex: 5, transform: 'rotateX(65deg)', opacity: voandoPara === el.nome ? 0 : 1, transition: 'opacity 0.5s' }}></div>
                                                <span style={{ color: el.color1, position: 'absolute', bottom: '-30px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,255,255,0.5)', opacity: voandoPara === el.nome ? 0 : 1, transition: 'opacity 0.5s' }}>{el.nome}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                            if (el.tipo === 'terra') {
                                return (
                                    <div key={el.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', transformStyle: 'preserve-3d' }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, width: el.size, height: el.size, zIndex: voandoPara === 'Terra 0' ? 9999 : 20, offsetPath: `path("${caminhosGerados[el.id]}")`, offsetRotate: '0deg', animation: `orbitaSempre ${el.tempo} linear infinite`, animationDelay: atrasosOrbitais[el.id] || el.delay, transformStyle: 'preserve-3d', pointerEvents: 'auto' }}>
                                            <div style={{ width: '100%', height: '100%', transform: voandoPara === 'Terra 0' ? `${billboardTransform} scale(40)` : billboardTransform, transition: voandoPara === 'Terra 0' ? 'all 1.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none', opacity: voandoPara && voandoPara !== 'Terra 0' ? 0 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transformStyle: 'preserve-3d' }}>
                                                <div onClick={() => iniciarViagem('Terra 0', 'globo')} style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #4db8ff, #002244)', boxShadow: 'inset -20px -20px 40px rgba(0,0,0,0.9), inset 10px 10px 20px rgba(255,255,255,0.4), 0 0 40px rgba(0,150,255,0.6)', border: '1px solid rgba(255,255,255,0.2)', zIndex: 10, cursor: 'pointer', '--atm': 'rgba(90,190,255,0.75)' }} className="astro-esfera astro-terra0"><span className="astro-textura astro-superficie" /><span className="astro-textura astro-nuvens" /><span className="astro-borda" /></div>
                                                <div style={{ position: 'absolute', width: '220%', height: '220%', transform: 'rotateX(75deg)', pointerEvents: 'none', zIndex: 5, transformStyle: 'preserve-3d', opacity: voandoPara === 'Terra 0' ? 0 : 1, transition: 'opacity 0.5s' }}>
                                                    <div className="moon-orbit-flat" style={{ width: '100%', height: '100%', borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.25)', position: 'relative', transformStyle: 'preserve-3d' }}>
                                                        <div style={{ position: 'absolute', top: '0%', left: '50%', width: 0, height: 0, transformStyle: 'preserve-3d' }}><div className="moon-sphere" style={{ width: '16px', height: '16px', background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #777777 50%, #000000 100%)', borderRadius: '50%', boxShadow: 'inset -4px -4px 8px rgba(0,0,0,0.9), 0 0 10px rgba(255,255,255,0.6)' }}><span className="moon-text" style={{position:'absolute', top: '-20px', left:'-8px', fontSize:'12px', fontWeight: 'bold', color:'#fff', textShadow: '0 0 6px #000'}}>Maria</span></div></div>
                                                        <div style={{ position: 'absolute', top: '85%', left: '85%', width: 0, height: 0, transformStyle: 'preserve-3d' }}><div className="moon-sphere" style={{ width: '14px', height: '14px', background: 'radial-gradient(circle at 35% 35%, #ffaaaa 0%, #aa3333 50%, #220000 100%)', borderRadius: '50%', boxShadow: 'inset -4px -4px 8px rgba(0,0,0,0.9), 0 0 10px rgba(255,100,100,0.6)' }}><span className="moon-text" style={{position:'absolute', top: '-20px', right:'-5px', fontSize:'12px', fontWeight: 'bold', color:'#fff', textShadow: '0 0 6px #000'}}>Rose</span></div></div>
                                                        <div style={{ position: 'absolute', top: '85%', left: '15%', width: 0, height: 0, transformStyle: 'preserve-3d' }}><div className="moon-sphere" style={{ width: '20px', height: '20px', background: 'radial-gradient(circle at 35% 35%, #aaaaff 0%, #4444aa 50%, #000022 100%)', borderRadius: '50%', boxShadow: 'inset -5px -5px 10px rgba(0,0,0,0.9), 0 0 15px rgba(100,150,255,0.6)' }}><span className="moon-text" style={{position:'absolute', top: '-20px', left:'-5px', fontSize:'12px', fontWeight: 'bold', color:'#fff', textShadow: '0 0 6px #000'}}>Sina</span></div></div>
                                                    </div>
                                                </div>
                                                <span style={{ color: '#4db8ff', position: 'absolute', bottom: '-40px', fontSize: '18px', fontWeight: 'bold', letterSpacing: '4px', textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,150,255,1)', whiteSpace: 'nowrap', pointerEvents: 'none', opacity: voandoPara === 'Terra 0' ? 0 : 1, transition: 'opacity 0.5s' }}>{el.nome}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })}
                    </div>
                </div>
                <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flashBranco ? 1 : 0, pointerEvents: 'none', zIndex: 999999, transition: 'opacity 0.2s ease-out' }} />
                <style dangerouslySetInnerHTML={{__html: `
                    /* Texturas dos astros: camadas translúcidas que giram devagar por cima do degradê de cada esfera */
                    .astro-esfera, .astro-estrela { position: relative; overflow: hidden; }
                    .astro-textura { position: absolute; top: 0; left: 0; width: 200%; height: 100%; background-repeat: repeat-x; background-size: 50% 100%; pointer-events: none; mix-blend-mode: soft-light; animation: astroGira var(--giro, 70s) linear infinite; }
                    @keyframes astroGira { to { transform: translateX(-50%); } }
                    .astro-borda { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; background: radial-gradient(circle at 32% 30%, rgba(255,255,255,0.16) 0%, transparent 38%), radial-gradient(circle at 70% 72%, transparent 52%, rgba(0,0,0,0.5) 100%); box-shadow: inset 0 0 14px 2px var(--atm, rgba(140,190,255,0.45)); }
                    .astro-borda-estrela { background: radial-gradient(circle at 32% 30%, rgba(255,255,255,0.25) 0%, transparent 40%); box-shadow: inset 0 0 30px 6px rgba(255,120,0,0.55); }
                    .astro-granulos { --giro: 160s; mix-blend-mode: overlay; background-image: radial-gradient(circle at 12% 22%, rgba(255,255,190,0.7) 0 2.6%, transparent 3.4%), radial-gradient(circle at 34% 64%, rgba(255,120,0,0.55) 0 3.4%, transparent 4.4%), radial-gradient(circle at 58% 28%, rgba(255,255,170,0.65) 0 2.2%, transparent 3%), radial-gradient(circle at 78% 70%, rgba(255,90,0,0.55) 0 3%, transparent 4%), radial-gradient(circle at 90% 40%, rgba(255,240,160,0.6) 0 2.4%, transparent 3.2%), radial-gradient(circle at 47% 86%, rgba(255,230,150,0.55) 0 2.2%, transparent 3%); }
                    .astro-manchas { --giro: 220s; mix-blend-mode: multiply; background-image: radial-gradient(ellipse at 28% 46%, rgba(150,45,0,0.6) 0 3.5%, rgba(255,120,0,0.2) 4.5% 7%, transparent 8%), radial-gradient(ellipse at 74% 36%, rgba(140,40,0,0.5) 0 2.6%, transparent 4.5%), radial-gradient(ellipse at 56% 74%, rgba(160,60,0,0.45) 0 2%, transparent 3.6%); }
                    .astro-corona { position: absolute; inset: -42%; border-radius: 50%; pointer-events: none; background: repeating-conic-gradient(from 0deg, rgba(255,190,40,0.14) 0deg 4deg, transparent 4deg 15deg); -webkit-mask-image: radial-gradient(circle, #000 34%, transparent 70%); mask-image: radial-gradient(circle, #000 34%, transparent 70%); animation: astroCoronaGira 90s linear infinite, astroCoronaPulsa 6s ease-in-out infinite alternate; }
                    @keyframes astroCoronaGira { to { rotate: 360deg; } }
                    @keyframes astroCoronaPulsa { from { opacity: 0.55; scale: 0.97; } to { opacity: 1; scale: 1.05; } }
                    .astro-vegeta .astro-superficie { --giro: 90s; mix-blend-mode: multiply; background-image: radial-gradient(circle at 18% 30%, rgba(40,0,0,0.65) 0 7%, transparent 8%), radial-gradient(circle at 62% 62%, rgba(40,0,0,0.6) 0 9%, transparent 10%), radial-gradient(circle at 82% 24%, rgba(40,0,0,0.55) 0 5%, transparent 6%), radial-gradient(circle at 40% 80%, rgba(40,0,0,0.55) 0 6%, transparent 7%), linear-gradient(95deg, transparent 0 28%, rgba(60,0,0,0.35) 34%, transparent 42% 68%, rgba(60,0,0,0.3) 74%, transparent 82%); }
                    .astro-vegeta .astro-nuvens { --giro: 60s; mix-blend-mode: screen; background-image: radial-gradient(circle at 18% 30%, transparent 0 7%, rgba(255,190,150,0.5) 8%, transparent 10%), radial-gradient(circle at 62% 62%, transparent 0 9%, rgba(255,190,150,0.45) 10%, transparent 12%), radial-gradient(ellipse at 48% 46%, rgba(255,150,90,0.22) 0 30%, transparent 42%); }
                    .astro-namekusei .astro-superficie { --giro: 110s; mix-blend-mode: multiply; background-image: radial-gradient(ellipse at 25% 40%, rgba(0,70,20,0.75) 0 20%, transparent 24%), radial-gradient(ellipse at 72% 62%, rgba(0,60,25,0.7) 0 22%, transparent 26%), radial-gradient(ellipse at 52% 18%, rgba(0,80,30,0.55) 0 12%, transparent 16%); }
                    .astro-namekusei .astro-nuvens { --giro: 45s; mix-blend-mode: screen; background-image: radial-gradient(ellipse at 20% 62%, rgba(220,255,220,0.5) 0 12%, transparent 17%), radial-gradient(ellipse at 66% 30%, rgba(220,255,230,0.45) 0 14%, transparent 19%), radial-gradient(ellipse at 83% 72%, rgba(210,255,210,0.4) 0 9%, transparent 13%); }
                    .astro-desconhecido .astro-superficie { --giro: 40s; mix-blend-mode: overlay; background-image: radial-gradient(ellipse at 62% 60%, rgba(255,255,255,0.8) 0 6%, rgba(0,40,140,0.65) 8% 13%, transparent 15%), repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 5%, rgba(0,0,90,0.5) 5% 13%, rgba(120,170,255,0.3) 13% 20%, rgba(0,0,60,0.4) 20% 27%); }
                    .astro-desconhecido .astro-nuvens { --giro: 28s; mix-blend-mode: soft-light; background-image: repeating-linear-gradient(8deg, rgba(255,255,255,0.28) 0 3%, transparent 3% 11%, rgba(0,0,70,0.3) 11% 15%, transparent 15% 22%); }
                    .astro-terra0 .astro-superficie { --giro: 80s; mix-blend-mode: normal; background-image: linear-gradient(180deg, rgba(255,255,255,0.7) 0 5%, transparent 11% 90%, rgba(255,255,255,0.65) 95%), radial-gradient(ellipse at 28% 44%, rgba(60,140,70,0.85) 0 15%, rgba(120,110,60,0.6) 17% 20%, transparent 22%), radial-gradient(ellipse at 52% 36%, rgba(70,150,75,0.8) 0 11%, rgba(130,115,60,0.55) 13% 16%, transparent 18%), radial-gradient(ellipse at 74% 62%, rgba(55,130,65,0.85) 0 16%, rgba(125,105,55,0.6) 18% 21%, transparent 23%), radial-gradient(ellipse at 40% 78%, rgba(60,135,70,0.7) 0 7%, transparent 10%); }
                    .astro-terra0 .astro-nuvens { --giro: 50s; mix-blend-mode: screen; background-image: radial-gradient(ellipse at 20% 30%, rgba(255,255,255,0.4) 0 7%, transparent 11%), radial-gradient(ellipse at 40% 58%, rgba(255,255,255,0.36) 0 9%, transparent 13%), radial-gradient(ellipse at 66% 26%, rgba(255,255,255,0.36) 0 7%, transparent 11%), radial-gradient(ellipse at 82% 68%, rgba(255,255,255,0.32) 0 8%, transparent 12%), radial-gradient(ellipse at 56% 84%, rgba(255,255,255,0.3) 0 6%, transparent 9%); }
                    @media (prefers-reduced-motion: reduce) { .astro-textura, .astro-corona { animation: none; } }
                    .fade-in { animation: fadeIn 0.8s ease-in-out; }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    .moon-orbit-flat { animation: spinFlat 15s linear infinite; }
                    @keyframes spinFlat { 100% { transform: rotateZ(360deg); } }
                    .moon-sphere { position: absolute; transform-style: preserve-3d; animation: standUpMoon 15s linear infinite; }
                    @keyframes standUpMoon { 0% { transform: translate(-50%, -50%) rotateZ(0deg) rotateX(-75deg); } 100% { transform: translate(-50%, -50%) rotateZ(-360deg) rotateX(-75deg); } }
                    .linha-orbita-animada { animation: fluxoEnergia 2s linear infinite; }
                    @keyframes fluxoEnergia { from { stroke-dashoffset: 45; } to { stroke-dashoffset: 0; } }
                    @keyframes orbitaSempre { 0% { offset-distance: 0%; } 100% { offset-distance: 100%; } }
                `}} />
            </div>
        );
    }

    // ==========================================
    // 🌌 TELA 1: COSMOLOGIA
    // ==========================================
    if (nivelVisao === 'cosmologia') {
        return (
            <div className="fade-in" style={{ width: '100%', height: '85vh', background: '#050508', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <PainelModoDeus />
                <button onClick={() => iniciarViagem('Espaço Sideral', 'sistema_solar')} style={{ position: 'absolute', top: '20px', left: '20px', background: 'transparent', border: '1px solid #fff', color: '#fff', padding: '8px 18px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', zIndex: 100, opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>⬅ VOLTAR AO ESPAÇO</button>

                <div ref={containerRef} onMouseMove={handleDragMoveCosmo} onMouseUp={handleDragEndCosmo} onMouseLeave={handleDragEndCosmo} onTouchMove={handleDragMoveCosmo} onTouchEnd={handleDragEndCosmo} style={{ position: 'relative', width: '1000px', height: '600px', borderRadius: '15px', overflow: 'hidden', marginTop: '50px' }}>
                    <img src={mapaCosmologia} alt="Cosmologia" style={{ width: '100%', height: '100%', objectFit: 'fill', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.1))', pointerEvents: 'none', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }} />
                    {zonasCosmologia.map((zona, index) => (
                        <div key={`${zona.nome}-${index}`} onMouseEnter={() => !modoAjuste && setPlanoHover(zona.nome)} onMouseLeave={() => !modoAjuste && setPlanoHover(null)} onMouseDown={(e) => handleDragStartCosmo(e, index)} onTouchStart={(e) => handleDragStartCosmo(e, index)} onClick={() => iniciarViagem(zona.nome, zona.isPlanet ? 'globo' : null)}
                            style={{
                                position: 'absolute', top: zona.top, left: zona.left, width: zona.width, height: zona.height, borderRadius: zona.isCircle ? '50%' : '15px', cursor: modoAjuste ? 'grab' : 'pointer', zIndex: voandoPara === zona.nome ? 9999 : (zona.zIndex || 10), border: modoAjuste || planoHover === zona.nome ? `2px dashed ${zona.cor}` : '2px solid transparent', boxShadow: modoAjuste || planoHover === zona.nome ? `0 0 15px ${zona.cor}, inset 0 0 10px ${zona.cor}` : 'none', background: modoAjuste ? 'rgba(255,255,255,0.2)' : (planoHover === zona.nome ? 'rgba(255,255,255,0.15)' : 'transparent'), transform: voandoPara === zona.nome ? 'scale(30)' : 'scale(1)', transition: voandoPara === zona.nome ? 'all 1.5s cubic-bezier(0.4, 0, 0.2, 1)' : (dragIndexCosmo === index ? 'none' : '0.2s ease-in-out'), opacity: voandoPara && voandoPara !== zona.nome ? 0 : 1,
                            }}
                        />
                    ))}
                </div>
                {!modoAjuste && (
                    <div style={{ position: 'absolute', bottom: '30px', textAlign: 'center', pointerEvents: 'none', zIndex: 50, opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>
                        <h1 style={{ color: '#fff', margin: 0, letterSpacing: '6px', textTransform: 'uppercase', fontSize: '1.4em', textShadow: '0 0 20px rgba(255,255,255,0.8)' }}>{planoHover || 'Atlas Multiversal'}</h1>
                    </div>
                )}
                <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flashBranco ? 1 : 0, pointerEvents: 'none', zIndex: 999999, transition: 'opacity 0.2s ease-out' }} />
            </div>
        );
    }

    // ==========================================
    // 🌍 TELA 2: O GLOBO
    // ==========================================
    if (nivelVisao === 'globo') {
        return (
            <div className="fade-in" style={{ width: '100%', height: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050508', borderRadius: '10px', border: '1px solid #0088ff', position: 'relative', overflow: 'hidden' }} onMouseMove={handleGloboDragMove} onMouseUp={handleGloboDragEnd} onMouseLeave={handleGloboDragEnd} onTouchMove={handleGloboDragMove} onTouchEnd={handleGloboDragEnd}>
                <div style={{ position: 'absolute', top: '20px', left: '20px', display: 'flex', gap: '10px', zIndex: 30, opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>
                    <button onClick={() => iniciarViagem('Espaço Sideral', 'sistema_solar')} style={{ background: 'transparent', border: '1px solid #00ffcc', color: '#00ffcc', padding: '8px 18px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>⬅ ESPAÇO FÍSICO</button>
                    <button onClick={() => iniciarViagem('Multiverso', 'cosmologia')} style={{ background: 'rgba(72, 61, 139, 0.4)', border: '1px solid #DDA0DD', color: '#DDA0DD', padding: '8px 18px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>🌌 MULTIVERSO</button>
                </div>
                <div style={{ position: 'absolute', top: '20px', textAlign: 'center', zIndex: 10, pointerEvents: 'none', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}><h2 style={{ color: '#00ffcc', margin: 0, textTransform: 'uppercase', letterSpacing: '3px', textShadow: '0 0 10px #00ffcc' }}>Visão Orbital: Terra 0</h2></div>
                <div style={{ position: 'relative', width: '350px', height: '350px', perspective: '1000px' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#000814', border: '2px solid #0088ff', pointerEvents: 'none', boxShadow: '0 0 50px rgba(0, 136, 255, 0.2)', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}></div>
                    <div onMouseDown={handleGloboDragStart} onTouchStart={handleGloboDragStart} style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: voandoPara === 'Runeterra' ? `scale(10)` : `rotateX(${rotacaoGlobo.y}deg) rotateY(${rotacaoGlobo.x}deg)`, cursor: isDragging ? 'grabbing' : 'grab', transition: voandoPara === 'Runeterra' ? 'transform 1.5s cubic-bezier(0.4, 0, 0.2, 1)' : (isDragging ? 'none' : 'transform 0.5s ease-out') }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(0,255,204,0.15)', transform: 'rotateX(90deg)', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}></div><div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(0,255,204,0.15)', transform: 'rotateY(90deg)', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}></div><div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(0,255,204,0.15)', transform: 'rotateZ(45deg) rotateX(90deg)', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}></div>
                        <div style={{ position: 'absolute', inset: 0, transform: 'translateZ(160px)', backfaceVisibility: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <svg viewBox="0 0 200 200" style={{ position: 'absolute', width: '140px', height: '140px', filter: 'drop-shadow(0 0 3px rgba(0,255,204,0.8))', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}><path d="M 12 55 L 18 45 L 30 38 L 42 35 L 55 30 L 70 28 L 85 25 L 100 28 L 115 32 L 125 30 L 135 38 L 142 42 L 140 52 L 132 58 L 122 56 L 115 65 L 105 72 L 95 68 L 82 72 L 68 80 L 52 75 L 40 82 L 25 72 L 15 75 Z" fill="rgba(0,255,204,0.08)" stroke="#00ffcc" strokeWidth="1" strokeLinejoin="round" /><path d="M 45 92 L 58 85 L 75 82 L 95 84 L 110 88 L 118 82 L 128 92 L 138 105 L 132 120 L 142 135 L 135 148 L 125 152 L 115 168 L 105 160 L 92 168 L 75 162 L 62 152 L 48 142 L 38 125 L 42 108 L 40 98 Z" fill="rgba(0,255,204,0.08)" stroke="#00ffcc" strokeWidth="1" strokeLinejoin="round" /><path d="M 152 28 L 162 20 L 175 18 L 182 25 L 185 38 L 178 50 L 182 62 L 172 72 L 160 75 L 150 65 L 148 50 L 145 38 Z" fill="rgba(0,255,204,0.08)" stroke="#00ffcc" strokeWidth="1" strokeLinejoin="round" /><circle cx="162" cy="85" r="2" fill="#00ffcc" /><line x1="105" y1="72" x2="110" y2="88" stroke="#ffcc00" strokeWidth="1.5" /></svg>
                            <button onClick={() => iniciarViagem('Runeterra', () => { setLocalAtual({ continente: 'Runeterra', reino: null, mapaId: null, plano: 'Material' }); setNivelVisao('continente'); })} style={{ pointerEvents: 'auto', background: 'rgba(0,255,204,0.1)', border: '2px solid #00ffcc', color: '#00ffcc', padding: '12px 24px', borderRadius: '30px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9em', letterSpacing: '2px', backdropFilter: 'blur(5px)', boxShadow: '0 0 20px rgba(0,255,204,0.4)', zIndex: 10, opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>🌍 ENTRAR EM RUNETERRA</button>
                        </div>
                    </div>
                </div>
                <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flashBranco ? 1 : 0, pointerEvents: 'none', zIndex: 999999, transition: 'opacity 0.2s ease-out' }} />
            </div>
        );
    }

    // ==========================================
    // 🗺️ TELA 3: O CONTINENTE
    // ==========================================
    if (nivelVisao === 'continente') {
        const mapasSalvosNoAtlas = atlas[reinoSelecionado] || [];

        return (
            <div className="fade-in" style={{ width: '100%', height: '85vh', background: '#050508', borderRadius: '10px', border: '1px solid #0088ff', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.85)', padding: '12px 25px', borderBottom: '1px solid #222', zIndex: 10, opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }}>
                    <button onClick={() => iniciarViagem('Globo', 'globo')} style={{ background: '#ff4444', color: '#fff', border: 'none', padding: '6px 18px', borderRadius: '5px', fontSize: '0.85em', cursor: 'pointer', fontWeight: 'bold' }}>⬅ VOLTAR AO GLOBO</button>
                    <h2 style={{ color: '#0088ff', margin: 0, textTransform: 'uppercase', letterSpacing: '3px', textShadow: '0 0 10px #0088ff' }}>{reinoHover || localAtual.continente}</h2>
                    <div style={{ width: '120px' }}></div>
                </div>
                
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative', width: '100%' }}>
                    <div style={{ position: 'relative', display: 'inline-block', height: '100%', maxHeight: 'calc(85vh - 70px)' }}>
                        <img src={mapaClean} alt="Mapa Base" style={{ display: 'block', height: '100%', width: 'auto', objectFit: 'contain', opacity: voandoPara ? 0 : 1, transition: 'opacity 1s' }} />
                        
                        {posicoesPings.map((reino) => (
                            reino.img ? <img key={`mask-${reino.nome}`} src={reino.img} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2, mixBlendMode: 'screen', opacity: voandoPara ? 0 : (reinoHover === reino.nome ? 1 : 0), transition: 'opacity 0.3s ease-out' }} alt={`Mascara ${reino.nome}`} /> : null
                        ))}

                        {posicoesPings.map((reino) => (
                            <div key={reino.nome} className={`ping-wrapper ${reinoHover === reino.nome ? 'active' : ''}`} style={{ top: reino.top, left: reino.left, pointerEvents: 'auto', cursor: 'pointer', position: 'absolute', transform: voandoPara === reino.nome ? 'translate(-50%, -50%) scale(40)' : (reinoHover === reino.nome ? 'translate(-50%, -50%) scale(1.1)' : 'translate(-50%, -50%) scale(1)'), display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: voandoPara === reino.nome ? 9999 : 5, padding: '10px', opacity: voandoPara && voandoPara !== reino.nome ? 0 : 1, transition: voandoPara === reino.nome ? 'all 1.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'all 0.3s ease-out' }} onMouseEnter={() => setReinoHover(reino.nome)} onMouseLeave={() => setReinoHover(null)} onClick={(e) => { e.stopPropagation(); iniciarViagem(reino.nome, () => abrirMenuReino(reino.nome)); }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: '0.3s', boxShadow: '0 0 15px rgba(0,0,0,0.9)', borderWidth: '2px', borderStyle: 'solid', borderColor: reinoHover === reino.nome ? '#fff' : reino.cor, opacity: voandoPara === reino.nome ? 0 : 1 }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', transition: '0.3s', background: reinoHover === reino.nome ? '#fff' : reino.cor }} />
                                </div>
                                <div style={{ marginTop: '6px', background: reinoHover === reino.nome ? '#fff' : 'rgba(0,0,0,0.9)', padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', color: reinoHover === reino.nome ? '#000' : '#fff', textTransform: 'uppercase', letterSpacing: '1.5px', border: `1px solid ${reinoHover === reino.nome ? '#fff' : 'transparent'}`, whiteSpace: 'nowrap', transition: '0.3s', opacity: voandoPara === reino.nome ? 0 : 1 }}>{reino.nome}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {reinoSelecionado && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 30, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(6px)' }}>
                        <div style={{ background: '#111', border: '2px solid #0088ff', borderRadius: '20px', padding: '30px', width: '380px', textAlign: 'center', position: 'relative' }}>
                            <button onClick={() => setReinoSelecionado(null)} style={{ position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', color: '#ff4444', fontSize: '22px', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                            <h2 style={{ color: '#ffcc00', margin: '0 0 10px 0', textTransform: 'uppercase' }}>{reinoSelecionado}</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '25px', maxHeight: '200px', overflowY: 'auto' }}>
                                
                                {/* LÊ DO ATLAS LOCAL */}
                                {mapasSalvosNoAtlas.map(mapa => (
                                    <button key={mapa.id} onClick={() => entrarNoMapaDeBatalha(mapa)} style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>🗺️ {mapa.nome}</button>
                                ))}
                            </div>
                            <button onClick={criarNovoMapa} style={{ width: '100%', background: 'linear-gradient(to right, #0088ff, #00ffcc)', color: '#000', padding: '14px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>➕ CRIAR NOVO MAPA</button>
                        </div>
                    </div>
                )}

                {criandoMapa && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(6px)' }}>
                        <div style={{ background: '#111', border: '2px solid #00ffcc', borderRadius: '20px', padding: '30px', width: '340px', textAlign: 'center', position: 'relative' }}>
                            <button onClick={() => setCriandoMapa(false)} style={{ position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', color: '#ff4444', fontSize: '22px', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                            <h2 style={{ color: '#00ffcc', margin: '0 0 15px 0', textTransform: 'uppercase', fontSize: '1.1em' }}>Novo Mapa em {reinoSelecionado}</h2>
                            <input
                                type="text"
                                autoFocus
                                value={novoMapaNome}
                                onChange={(e) => setNovoMapaNome(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') confirmarNovoMapa(); }}
                                placeholder="Nome do mapa..."
                                style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid #444', background: '#1a1a1a', color: '#fff', marginBottom: '20px', boxSizing: 'border-box' }}
                            />
                            <button onClick={confirmarNovoMapa} style={{ width: '100%', background: 'linear-gradient(to right, #0088ff, #00ffcc)', color: '#000', padding: '14px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>✅ CONFIRMAR</button>
                        </div>
                    </div>
                )}
                <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flashBranco ? 1 : 0, pointerEvents: 'none', zIndex: 999999, transition: 'opacity 0.2s ease-out' }} />
            </div>
        );
    }

    // ==========================================
    // ⚔️ TELA 4: MAPA DE BATALHA (O REINO)
    // ==========================================
    if (nivelVisao === 'reino') {
        const mapaAtivoObj = (atlas[localAtual.reino] || []).find(m => m.id === localAtual.mapaId);
        // Cenas publicadas/visualizadas via Gerenciador de Cenas não têm entrada no Atlas local
        // (localAtual.reino fica null nesse caso) — cai pra imagem já sincronizada da própria Cena.
        const backgroundUrl = mapaAtivoObj ? mapaAtivoObj.img : (ctxMapa?.cenaAtual?.img || '');

        return (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '85vh' }}>
                <div style={{ background: '#111', padding: '12px 20px', borderRadius: '10px 10px 0 0', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <button onClick={voltarCamera} style={{ background: '#ff4444', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>⬅ SAIR</button>
                        <button onClick={() => { setUrlInput(backgroundUrl || ''); setSalvandoCenario(false); setModoEdicaoMapa(true); }} style={{ background: 'transparent', color: '#0088ff', border: '1px solid #0088ff', padding: '7px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>⚙️ EDITAR CENÁRIO</button>
                    </div>
                    <span style={{ color: '#ffcc00', fontWeight: 'bold', textTransform: 'uppercase' }}>{localAtual.reino ? `${localAtual.reino} : ` : ''}{localAtual.mapaNome}</span>
                </div>
                
                <div className="fade-in" style={{ flex: 1, position: 'relative', backgroundColor: '#050508', backgroundImage: urlSeguraParaCss(backgroundUrl) || 'none', backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                    
                    {/* A GRELHA DE COMBATE (OVERLAY) */}
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5 }}>{children}</div>
                    
                    {modoEdicaoMapa && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 25, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ background: '#111', border: '2px solid #0088ff', borderRadius: '20px', padding: '30px', width: '420px', textAlign: 'center', position: 'relative' }}>
                                <button onClick={() => setModoEdicaoMapa(false)} style={{ position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', color: '#ff4444', fontSize: '20px', cursor: 'pointer' }}>X</button>
                                
                                <h3 style={{ color: '#0088ff', marginTop: 0 }}>Configurar Cenário</h3>
                                <p style={{ color: '#aaa', fontSize: '0.85em', marginBottom: '15px' }}>Defina a imagem de fundo deste campo de batalha. Isso será atualizado para todos os jogadores.</p>
                                
                                <label style={{ display: 'block', textAlign: 'left', color: '#0088ff', fontSize: '0.8em', marginBottom: '5px' }}>1. Fazer Upload do PC:{salvandoCenario && ' (Enviando...)'}</label>
                                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={salvandoCenario} style={{ display: 'block', color: '#fff', marginBottom: '20px', width: '100%', background: '#1a1a1a', padding: '10px', borderRadius: '8px', border: '1px solid #444', opacity: salvandoCenario ? 0.5 : 1 }} />

                                <label style={{ display: 'block', textAlign: 'left', color: '#0088ff', fontSize: '0.8em', marginBottom: '5px' }}>2. Ou colar URL de Imagem:</label>
                                <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="http://..." disabled={salvandoCenario} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid #444', background: '#1a1a1a', color: '#fff', marginBottom: '25px', opacity: salvandoCenario ? 0.5 : 1 }} />

                                <button onClick={salvarUrl} disabled={salvandoCenario} style={{ width: '100%', background: '#0088ff', color: '#fff', padding: '14px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: salvandoCenario ? 'default' : 'pointer', opacity: salvandoCenario ? 0.5 : 1 }}>{salvandoCenario ? '⏳ SALVANDO...' : '💾 SALVAR CENÁRIO'}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    return null;
}