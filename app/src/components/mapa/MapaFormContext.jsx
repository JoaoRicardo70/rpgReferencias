import React, { createContext, useContext, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed, salvarDummie, uploadImagem, salvarCenarioCompleto, zerarIniciativaGlobal, aplicarDanoDireto } from '../../services/firebase-sync';
import { calcularAcerto } from '../../core/engine';
import { resolverEfeitosEntidade } from '../../core/efeitos-resolver';
import { getBuffs } from '../../core/attributes';
import { aplicarRegeneracaoDeTurno, descansarCompleto } from '../../core/vitals';
import { calcularGanhoFadigaDinamico } from '../../core/fadiga';

export const MAP_SIZE = 30;
export const PALETA = ['#ff003c', '#0088ff', '#00ff88', '#ffcc00', '#ff00ff', '#00ffff', '#ff8800', '#88ff00'];

export function urlSeguraParaCss(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) && !/^data:image\//i.test(trimmed)) return '';
    return `url("${trimmed.replace(/["\\)]/g, '')}")`;
}

export function calcularCA(ficha, tipo) {
    if (!ficha) return 10;
    const getDoisDigitos = (valor) => {
        if (!valor) return 0;
        const strVal = String(valor).replace(/[^0-9]/g, '');
        if (!strVal) return 0;
        return parseInt(strVal.substring(0, 2), 10);
    };
    let base = 5;
    if (tipo === 'evasiva') base += getDoisDigitos(ficha.destreza?.base);
    if (tipo === 'resistencia') base += getDoisDigitos(ficha.forca?.base);

    let bonus = 0;
    const somarBonus = (efeitos) => {
        (efeitos || []).forEach(e => {
            if (e && e.atributo === tipo && e.propriedade === 'base') bonus += parseFloat(e.valor) || 0;
        });
    };

    (ficha.poderes || []).forEach(p => {
        let resolved = resolverEfeitosEntidade(p);
        if (p.ativa) somarBonus(resolved.efeitos);
        somarBonus(resolved.efeitosPassivos);
    });
    (ficha.passivas || []).forEach(p => { somarBonus(p.efeitos); });
    (ficha.inventario || []).filter(i => i.equipado).forEach(i => {
        let resolved = resolverEfeitosEntidade(i);
        somarBonus(resolved.efeitos);
        somarBonus(resolved.efeitosPassivos);
    });

    return Math.floor(base + bonus);
}

const MapaFormContext = createContext(null);

export function useMapaForm() {
    const ctx = useContext(MapaFormContext);
    if (!ctx) return null;
    return ctx;
}

export function MapaFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const meuNome = useStore(s => s.meuNome);
    const personagens = useStore(s => s.personagens);
    const updateFicha = useStore(s => s.updateFicha);
    const feedCombate = useStore(s => s.feedCombate) || [];
    const isMestre = useStore(s => s.isMestre);
    const mesaCriador = useStore(s => s.mesaCriador);
    const souCriador = !!meuNome && meuNome === mesaCriador;
    const dummies = useStore(s => s.dummies);
    const alvoSelecionado = useStore(s => s.alvoSelecionado);
    const cenario = useStore(s => s.cenario);
    const abaAtiva = useStore(s => s.abaAtiva);
    
    const fichaSegura = minhaFicha || {};

    const [modo3D, setModo3D] = useState(false);
    const [tamanhoCelula, setTamanhoCelula] = useState(35);
    const [iniciativaInput, setIniciativaInput] = useState(() => fichaSegura.iniciativa || 0);
    const [altitudeInput, setAltitudeInput] = useState(0);
    
    const turnoAtualIndex = cenario?.turnoAtualIndex || 0;
    const [feedIndexTurnoAtual, setFeedIndexTurnoAtual] = useState(0);
    const [jogadorHistory, setJogadorHistory] = useState(null);

    const [mapQD, setMapQD] = useState(1);
    const [mapFD, setMapFD] = useState(20);
    const [mapBonus, setMapBonus] = useState(0);
    const [mapStat, setMapStat] = useState('destreza');
    
    const [mapUsarProf, setMapUsarProf] = useState(false);
    const profGlobal = parseInt(fichaSegura.proficienciaBase) || 0;
    
    const [mapVantagens, setMapVantagens] = useState(() => fichaSegura.ataqueConfig?.vantagens || 0);
    const [mapDesvantagens, setMapDesvantagens] = useState(() => fichaSegura.ataqueConfig?.desvantagens || 0);
    
    const [novaCenaNome, setNovaCenaNome] = useState('');
    const [novaCenaEscala, setNovaCenaEscala] = useState(1.5);
    const [novaCenaUnidade, setNovaCenaUnidade] = useState('m');
    const [novaCenaApenasCriador, setNovaCenaApenasCriador] = useState(false);
    const [uploadingMap, setUploadingMap] = useState(false);

    const [dadoAnim, setDadoAnim] = useState({ ativo: false, numero: 20, finalResult: null, cor: '#00ffcc', quemRolou: '' });
    const prevFeedLen = useRef(feedCombate.length);

    const [cenaVisualizadaId, setCenaVisualizadaId] = useState(null);
    const cenaAtivaIdGlobal = cenario?.ativa || 'default';

    // 🔥 Se a Cena publicada pra mesa toda mudar (alguém deu "Publicar para Todos" ou entrou num
    // mapa novo pelo Mapa Mundi), solta qualquer "Ver Cena Oculta" que o Mestre tivesse fixado
    // antes — senão ele ficava travado olhando pra uma prévia antiga pra sempre, e a Cena nova
    // nunca aparecia sozinha pra ele (só descobria abrindo o Gerenciador de Cenas manualmente).
    const cenaAtivaIdGlobalRef = useRef(cenaAtivaIdGlobal);
    useEffect(() => {
        if (cenaAtivaIdGlobalRef.current !== cenaAtivaIdGlobal) {
            cenaAtivaIdGlobalRef.current = cenaAtivaIdGlobal;
            setCenaVisualizadaId(null);
        }
    }, [cenaAtivaIdGlobal]);

    const cenaRenderId = (isMestre && cenaVisualizadaId) ? cenaVisualizadaId : cenaAtivaIdGlobal;
    const cenaAtual = cenario?.lista?.[cenaRenderId] || { nome: 'Desconhecido', img: '', escala: 1.5, unidade: 'm' };

    const isModoRP = cenario?.modoRP === true;
    const [mestreVendoRP, setMestreVendoRP] = useState(false);
    
    const tavernaAtivos = Array.isArray(cenario?.tavernaAtivos) ? cenario.tavernaAtivos : [];
    const isPresenteNaTaverna = tavernaAtivos.includes(meuNome);

    // Atualiza a altitude baseada na cena atual!
    useEffect(() => {
        const pos = fichaSegura.posicoes ? fichaSegura.posicoes[cenaRenderId] : fichaSegura.posicao;
        setAltitudeInput(pos?.z || 0);
    }, [fichaSegura, cenaRenderId]);

    const toggleModoRP = useCallback(() => {
        const novoCenario = JSON.parse(JSON.stringify(cenario || {}));
        novoCenario.modoRP = !novoCenario.modoRP;
        if (!novoCenario.modoRP) novoCenario.tavernaAtivos = [];
        salvarCenarioCompleto(novoCenario);
        enviarParaFeed({ 
            tipo: 'sistema', 
            nome: 'SISTEMA', 
            texto: novoCenario.modoRP 
                ? '🍻 A Party entrou na Sala de Espera! O Mestre está a moldar a realidade...' 
                : '🌍 O VÉU FOI LEVANTADO! A REALIDADE É REVELADA!' 
        });
    }, [cenario]);

    const togglePresencaTaverna = useCallback(() => {
        const novoCenario = JSON.parse(JSON.stringify(cenario || {}));
        if (!Array.isArray(novoCenario.tavernaAtivos)) novoCenario.tavernaAtivos = [];
        if (isPresenteNaTaverna) {
            novoCenario.tavernaAtivos = novoCenario.tavernaAtivos.filter(n => n !== meuNome);
        } else {
            novoCenario.tavernaAtivos.push(meuNome);
        }
        salvarCenarioCompleto(novoCenario);
    }, [cenario, isPresenteNaTaverna, meuNome]);

    const overridesCompendio = useMemo(() => {
        if (!minhaFicha) return {};
        if (isMestre && minhaFicha.compendioOverrides) return minhaFicha.compendioOverrides;
        if (personagens) {
            const chaves = Object.keys(personagens);
            for(let k of chaves) {
                if (personagens[k]?.compendioOverrides) return personagens[k].compendioOverrides;
            }
        }
        return {};
    }, [isMestre, minhaFicha, personagens]);

    const toggleActionDot = useCallback((tipo, isAvailable, entidadeNome, isDummie, idDummie) => {
        if (isDummie && idDummie && isMestre) {
            const storeState = useStore.getState();
            const dData = storeState.dummies[idDummie];
            if (!dData) return;
            const acoes = dData.acoes ? JSON.parse(JSON.stringify(dData.acoes)) : { padrao: {max:1, atual:1}, bonus: {max:1, atual:1}, reacao: {max:1, atual:1} };
            if (isAvailable) acoes[tipo].atual = Math.max(0, acoes[tipo].atual - 1);
            else acoes[tipo].atual = Math.min(acoes[tipo].max, acoes[tipo].atual + 1);
            salvarDummie(idDummie, { ...dData, acoes });
        } else if (entidadeNome === meuNome) {
            updateFicha(f => {
                if (!f.acoes) f.acoes = { padrao: {max:1, atual:1}, bonus: {max:1, atual:1}, reacao: {max:1, atual:1} };
                if (isAvailable) f.acoes[tipo].atual = Math.max(0, f.acoes[tipo].atual - 1);
                else f.acoes[tipo].atual = Math.min(f.acoes[tipo].max, f.acoes[tipo].atual + 1);
            });
            salvarFichaSilencioso();
        }
    }, [isMestre, meuNome, updateFicha]);

    useEffect(() => {
        if (feedCombate.length > prevFeedLen.current) {
            const newItem = feedCombate[feedCombate.length - 1];
            if (newItem && newItem.rolagem && (newItem.tipo === 'acerto' || newItem.tipo === 'dano')) {
                const painelMapa = document.querySelector('.mapa-panel');
                const mapaVisivel = painelMapa && (painelMapa.offsetWidth > 0 || painelMapa.offsetHeight > 0);
                const isAbaMapa = String(abaAtiva || '').toLowerCase().includes('map');

                if (mapaVisivel || isAbaMapa) {
                    let rawRoll = 0;
                    let regexStrong = /<strong>(\d+)<\/strong>/g;
                    let match;
                    while ((match = regexStrong.exec(newItem.rolagem)) !== null) {
                        let v = parseInt(match[1]);
                        if (v > rawRoll) rawRoll = v;
                    }
                    if (rawRoll === 0) { 
                        let regexArr = /\[(.*?)\]/;
                        let mArr = regexArr.exec(newItem.rolagem);
                        if (mArr) {
                            let clean = mArr[1].replace(/<[^>]*>?/gm, ''); 
                            let nums = clean.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
                            if (nums.length > 0) rawRoll = Math.max(...nums);
                        }
                    }
                    if (rawRoll > 0) {
                        let corFinal = '#0088ff'; 
                        if (newItem.tipo === 'dano') {
                            if (newItem.armaStr?.includes('FATAL')) corFinal = '#ff003c'; 
                            else if (newItem.armaStr?.includes('CRÍTICO')) corFinal = '#ffcc00'; 
                        } else {
                            if (rawRoll === 20) corFinal = '#ff003c'; 
                            else if (rawRoll >= 18) corFinal = '#ffcc00'; 
                            else if (rawRoll === 1) corFinal = '#660000'; 
                        }
                        setDadoAnim({ ativo: true, numero: Math.floor(Math.random() * 20) + 1, finalResult: null, cor: '#00ffcc', quemRolou: newItem.nome });
                        let intervalos = 0;
                        const tempoGiro = setInterval(() => {
                            setDadoAnim(prev => ({ ...prev, numero: Math.floor(Math.random() * 20) + 1 }));
                            intervalos++;
                            if (intervalos > 15) {
                                clearInterval(tempoGiro);
                                setDadoAnim({ ativo: true, numero: rawRoll, finalResult: rawRoll, cor: corFinal, quemRolou: newItem.nome });
                                setTimeout(() => { setDadoAnim({ ativo: false, numero: 20, finalResult: null, cor: '#00ffcc', quemRolou: '' }); }, 2000);
                            }
                        }, 80);
                    }
                }
            }
        }
        prevFeedLen.current = feedCombate.length;
    }, [feedCombate, abaAtiva]);

    useEffect(() => {
        setMapVantagens(fichaSegura.ataqueConfig?.vantagens || 0);
        setMapDesvantagens(fichaSegura.ataqueConfig?.desvantagens || 0);
    }, [fichaSegura.ataqueConfig?.vantagens, fichaSegura.ataqueConfig?.desvantagens]);

    const changeVantagem = useCallback((e) => {
        const val = parseInt(e.target.value) || 0;
        setMapVantagens(val);
        updateFicha(f => { if(!f.ataqueConfig) f.ataqueConfig = {}; f.ataqueConfig.vantagens = val; });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const changeDesvantagem = useCallback((e) => {
        const val = parseInt(e.target.value) || 0;
        setMapDesvantagens(val);
        updateFicha(f => { if(!f.ataqueConfig) f.ataqueConfig = {}; f.ataqueConfig.desvantagens = val; });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const handleUploadNovaCena = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!novaCenaNome.trim()) return alert('Por favor, dê um nome à cena antes de anexar o mapa!');
        setUploadingMap(true);
        try {
            const urlPermanente = await uploadImagem(file, `mapas/${Date.now()}`);
            const novaCenaId = 'cena_' + Date.now();
            const novoCenario = JSON.parse(JSON.stringify(cenario));
            if (!novoCenario.lista) novoCenario.lista = {};
            novoCenario.lista[novaCenaId] = {
                nome: novaCenaNome, img: urlPermanente, escala: parseFloat(novaCenaEscala) || 1.5, unidade: novaCenaUnidade,
                // 🔥 Só o Mestre Supremo (souCriador) pode criar uma Cena que nem os Co-Mestres veem
                // no Gerenciador — enquanto ela não for publicada pra mesa toda.
                ...(souCriador && novaCenaApenasCriador ? { apenasCriador: true } : {})
            };
            salvarCenarioCompleto(novoCenario);
            setCenaVisualizadaId(novaCenaId);
            // Cena "só o Mestre Supremo vê" não avisa ninguém no feed — senão entregaria que algo
            // está sendo preparado escondido.
            if (!(souCriador && novaCenaApenasCriador)) {
                enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🗺️ O Mestre começou a preparar uma área desconhecida...` });
            }
            setNovaCenaNome('');
            setNovaCenaApenasCriador(false);
        } catch (err) {
            alert('Erro ao enviar a imagem para o Mapa. Verifique o Firebase Storage.');
        } finally {
            setUploadingMap(false);
        }
    }, [novaCenaNome, novaCenaEscala, novaCenaUnidade, novaCenaApenasCriador, souCriador, cenario]);

    const ativarCena = useCallback((id) => {
        const novoCenario = JSON.parse(JSON.stringify(cenario));
        novoCenario.ativa = id;
        salvarCenarioCompleto(novoCenario);
        setCenaVisualizadaId(null); 
        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🗺️ O cenário mudou para: ${novoCenario.lista[id].nome}!` });
    }, [cenario]);

    const deletarCena = useCallback((id) => {
        if(id === 'default') return alert("A cena inicial não pode ser apagada.");
        if(!window.confirm("Tem certeza que deseja apagar esta cena?")) return;
        const novoCenario = JSON.parse(JSON.stringify(cenario));
        delete novoCenario.lista[id];
        if(novoCenario.ativa === id) novoCenario.ativa = 'default';
        salvarCenarioCompleto(novoCenario);
        if(cenaVisualizadaId === id) setCenaVisualizadaId(null);
    }, [cenario, cenaVisualizadaId]);

    const coresJogadoresRef = useRef({});
    const corIndexRef = useRef(0);
    const corDoJogador = useCallback((nome) => {
        if (!coresJogadoresRef.current[nome]) {
            coresJogadoresRef.current[nome] = PALETA[corIndexRef.current % PALETA.length];
            corIndexRef.current++;
        }
        return coresJogadoresRef.current[nome];
    }, []);

    const deletarZona = useCallback((idZona) => {
        if(!window.confirm("O fluxo do tempo dissipa esta magia. Apagar a Zona de Efeito do mapa?")) return;
        const novoCenario = JSON.parse(JSON.stringify(cenario));
        novoCenario.zonas = (novoCenario.zonas || []).filter(z => z.id !== idZona);
        salvarCenarioCompleto(novoCenario);
    }, [cenario]);

    const getAvatarInfo = useCallback((ficha) => {
        if (!ficha) return { img: '', forma: null };
        const result = { img: ficha.avatar ? ficha.avatar.base : '', forma: null };
        if (ficha.poderes) {
            for (let j = 0; j < ficha.poderes.length; j++) {
                const p = ficha.poderes[j];
                if (p.ativa && p.imagemUrl && p.imagemUrl.trim() !== '') {
                    result.img = p.imagemUrl;
                    result.forma = p.nome;
                }
            }
        }
        return result;
    }, []);

    const fmt = useCallback((n) => Number(n || 0).toLocaleString('pt-BR'), []);

    const cells = useMemo(() => {
        const arr = [];
        for (let y = 0; y < MAP_SIZE; y++) {
            for (let x = 0; x < MAP_SIZE; x++) { arr.push({ x, y }); }
        }
        return arr;
    }, []);

    // 🔥 COLETA TODOS OS JOGADORES NA SALA (O Filtro de Cena é feito no TokenMap!) 🔥
    const jogadores = useMemo(() => {
        const result = {};
        if (meuNome && minhaFicha) result[meuNome] = minhaFicha;
        if (personagens) {
            const nomes = Object.keys(personagens);
            for (let i = 0; i < nomes.length; i++) {
                if (nomes[i] !== meuNome) result[nomes[i]] = personagens[nomes[i]];
            }
        }
        return result;
    }, [meuNome, minhaFicha, personagens]);

    const playersNaTaverna = useMemo(() => {
        return tavernaAtivos.map(nome => {
            const f = (nome === meuNome) ? minhaFicha : personagens?.[nome];
            return [nome, f];
        }).filter(([n, f]) => f != null);
    }, [tavernaAtivos, meuNome, minhaFicha, personagens]);

    // 🔥 MAPA DE TOKENS INDEPENDENTES POR CENA 🔥
    const tokenMap = useMemo(() => {
        const map = {};
        const nomes = Object.keys(jogadores);
        for (let i = 0; i < nomes.length; i++) {
            const nome = nomes[i];
            const ficha = jogadores[nome];
            
            // Puxa a posição ESPECÍFICA DESTA CENA
            let pos = ficha.posicoes ? ficha.posicoes[cenaRenderId] : null;
            
            // Fallback para personagens antigos que ainda não se moveram no novo sistema
            if (!pos && ficha.posicao && (ficha.posicao.cenaId || 'default') === cenaRenderId) {
                pos = ficha.posicao;
            }

            if (pos && pos.x !== undefined) {
                const key = `${pos.x},${pos.y}`;
                if (!map[key]) map[key] = [];
                map[key].push({ nome, ficha });
            }
        }
        return map;
    }, [jogadores, cenaRenderId]);

    // 🔥 MAPA DE DUMMIES POR CÉLULA (evita varrer todos os dummies em cada uma das células do grid)
    const dummyMap = useMemo(() => {
        const map = {};
        if (dummies) {
            const dIds = Object.keys(dummies);
            for (let i = 0; i < dIds.length; i++) {
                const id = dIds[i];
                const d = dummies[id];
                const dCena = d.cenaId || 'default';
                if (d.posicao?.x === undefined || dCena !== cenaRenderId) continue;
                const key = `${d.posicao.x},${d.posicao.y}`;
                if (!map[key]) map[key] = [];
                map[key].push([id, d]);
            }
        }
        return map;
    }, [dummies, cenaRenderId]);

    const tokens3D = useMemo(() => {
        return Object.entries(jogadores)
            .map(([nome, ficha]) => {
                let pos = ficha.posicoes ? ficha.posicoes[cenaRenderId] : null;
                if (!pos && ficha.posicao && (ficha.posicao.cenaId || 'default') === cenaRenderId) pos = ficha.posicao;
                return { nome, pos, ficha };
            })
            .filter(tk => tk.pos && tk.pos.x !== undefined)
            .map(tk => ({ nome: tk.nome, x: tk.pos.x || 0, y: tk.pos.y || 0, z: tk.pos.z || 0, cor: corDoJogador(tk.nome) }));
    }, [jogadores, cenaRenderId, corDoJogador]);

    const ordemIniciativa = useMemo(() => {
        const lista = [];
        if (jogadores) {
            const nomes = Object.keys(jogadores);
            for (let i = 0; i < nomes.length; i++) {
                const n = nomes[i];
                const f = jogadores[n];
                
                let pos = f.posicoes ? f.posicoes[cenaRenderId] : null;
                if (!pos && f.posicao && (f.posicao.cenaId || 'default') === cenaRenderId) pos = f.posicao;

                // Só aparece na iniciativa se estiver NA CENA ATUAL!
                if (f && f.iniciativa !== undefined && f.iniciativa > 0 && pos) {
                    lista.push({ id: n, nome: n, ficha: f, iniciativa: f.iniciativa, isDummie: false });
                }
            }
        }
        
        if (dummies) {
            const dIds = Object.keys(dummies);
            for (let i = 0; i < dIds.length; i++) {
                const id = dIds[i];
                const d = dummies[id];
                const cenaDoDummie = d?.cenaId || 'default';
                if (d && d.iniciativa !== undefined && d.iniciativa > 0 && cenaDoDummie === cenaRenderId) {
                    lista.push({ id: id, nome: d.nome, ficha: d, iniciativa: d.iniciativa, isDummie: true });
                }
            }
        }

        lista.sort((a, b) => b.iniciativa - a.iniciativa);
        return lista;
    }, [jogadores, dummies, cenaRenderId]);

    const getDanoDinamicoZona = useCallback((zona) => {
        let baseResult = { dano: zona.danoOriginal || zona.danoAplicado || 0, letalidade: zona.letalidadeOriginal || 0 };
        const storeState = useStore.getState();
        const fichaCaster = (zona.conjurador === storeState.meuNome) ? storeState.minhaFicha : storeState.personagens?.[zona.conjurador];
        if (!fichaCaster) return baseResult;
        
        const buffs = getBuffs(fichaCaster);
        let maxFuria = 0; let danoBrutoAtual = 0; let letalidadeAtual = 0;
        
        const scan = (efs) => {
            (efs || []).forEach(e => {
                if (!e) return;
                const prop = (e.propriedade || '').toLowerCase().trim();
                if (prop === 'furia_berserker') { const v = parseFloat(e.valor) || 0; if (v > maxFuria) maxFuria = v; }
                if (prop === 'dano_bruto' || prop === 'dano_verdadeiro') danoBrutoAtual += parseFloat(e.valor) || 0;
                if (prop === 'letalidade') letalidadeAtual += parseFloat(e.valor) || 0;
            });
        };
        
        (fichaCaster.poderes || []).forEach(p => { if (p.ativa) scan(p.efeitos); scan(p.efeitosPassivos); });
        (fichaCaster.inventario || []).forEach(i => { if (i.equipado) { scan(i.efeitos); scan(i.efeitosPassivos); } });
        (fichaCaster.passivas || []).forEach(p => scan(p.efeitos));
        
        const furiaAtiva = maxFuria > 0 ? maxFuria : 1;
        const multAtual = (buffs?.mbase || 1) * (buffs?.mgeral || 1) * (buffs?.mformas || 1) * (buffs?.mabs || 1) * furiaAtiva;
        const baseMulti = zona.multiplicadorOriginal || 1;
        
        let somaStatusAtual = 0;
        (zona.statusKeys || []).forEach(k => {
            const str = String(fichaCaster[k]?.base || '').replace(/[^0-9]/g, '');
            somaStatusAtual += parseInt(str.substring(0, 2), 10) || 0;
        });
        
        const diffStatus = somaStatusAtual - (zona.somaStatusOriginal || somaStatusAtual);
        const diffBruto = danoBrutoAtual - (zona.danoBrutoOriginal || danoBrutoAtual);
        const diffLetalidade = letalidadeAtual - (zona.letalidadeOriginalBuffs || letalidadeAtual);
        
        const novoDanoBase = (zona.danoOriginal / baseMulti) + diffStatus + diffBruto;
        const novoDano = Math.floor(novoDanoBase * multAtual);
        
        return { dano: novoDano > 0 ? novoDano : zona.danoOriginal, letalidade: (zona.letalidadeOriginal || 0) + diffLetalidade };
    }, []);

    const dispararEfeitoDaZona = useCallback((zona) => {
        const cenaAtivaId = cenario?.ativa || 'default';
        const escala = cenario?.lista?.[cenaAtivaId]?.escala || 1.5;
        const din = getDanoDinamicoZona(zona);
        const danoAtual = din.dano;
        const letalAtual = din.letalidade;
        let hitLog = [];

        const checkHit = (pos, nome, isDummie, idDummie, dData) => {
            if ((pos?.cenaId || 'default') !== (zona.cenaId || 'default')) return;
            if (zona.alvosFiltro === 'inimigos' && !isDummie) return;
            if (zona.alvosFiltro === 'aliados' && isDummie) return;

            const dX = Math.abs(pos.x - zona.x);
            const dY = Math.abs(pos.y - zona.y);
            const dZ = Math.floor(Math.abs((pos.z || 0) - (zona.z || 0)) / escala);
            
            if (Math.max(dX, dY, dZ) <= zona.raio) {
                hitLog.push(nome);
                if (isDummie && idDummie && dData) {
                    salvarDummie(idDummie, { ...dData, hpAtual: Math.max(0, dData.hpAtual - danoAtual) });
                } else if (nome === meuNome) {
                    updateFicha(f => { if (f.vida) f.vida.atual = Math.max(0, f.vida.atual - danoAtual); });
                    salvarFichaSilencioso();
                }
            }
        };

        Object.entries(dummies || {}).forEach(([id, d]) => checkHit(d.posicao, d.nome, true, id, d));
        
        let myPos = minhaFicha?.posicoes ? minhaFicha.posicoes[cenaAtivaId] : minhaFicha?.posicao;
        if (myPos) checkHit(myPos, meuNome, false, null, null);
        
        if (hitLog.length > 0) {
            const letalStr = letalAtual > 0 ? ` (+${letalAtual} Letalidade)` : '';
            enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🌪️ A Zona [${zona.nome}] castigou ${hitLog.join(', ')} com ${danoAtual} de Dano${letalStr}!` });
        }
    }, [cenario, getDanoDinamicoZona, dummies, minhaFicha, meuNome, updateFicha]);

    const processarEntradaNaZona = useCallback((oldPos, newX, newY, newZ, entidadeNome, isDummie, idDummie, dData) => {
        const cenaAtivaId = cenario?.ativa || 'default';
        const escala = cenario?.lista?.[cenaAtivaId]?.escala || 1.5;
        const zonasCena = (cenario?.zonas || []).filter(zo => (zo.cenaId || 'default') === cenaRenderId && zo.danoOriginal);
        
        zonasCena.forEach(zona => {
            if (zona.alvosFiltro === 'inimigos' && !isDummie) return;
            if (zona.alvosFiltro === 'aliados' && isDummie) return;

            let estavaDentro = false;
            if (oldPos && oldPos.x !== undefined) {
                const oldDX = Math.abs(oldPos.x - zona.x);
                const oldDY = Math.abs(oldPos.y - zona.y);
                const oldDZ = Math.floor(Math.abs((oldPos.z || 0) - (zona.z || 0)) / escala);
                estavaDentro = Math.max(oldDX, oldDY, oldDZ) <= zona.raio;
            }

            const dX = Math.abs(newX - zona.x);
            const dY = Math.abs(newY - zona.y);
            const dZ = Math.floor(Math.abs(newZ - (zona.z || 0)) / escala);
            const estaDentro = Math.max(dX, dY, dZ) <= zona.raio;

            if (!estavaDentro && estaDentro) {
                const din = getDanoDinamicoZona(zona);
                const danoAtual = din.dano;
                const letalAtual = din.letalidade;
                const letalStr = letalAtual > 0 ? ` (+${letalAtual} Letalidade)` : '';
                
                enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `⚠️ ${entidadeNome} pisou na área de [${zona.nome}] e sofreu ${danoAtual} de Dano${letalStr} imediatamente!` });
                
                if (isDummie && idDummie && dData) {
                    salvarDummie(idDummie, { ...dData, hpAtual: Math.max(0, dData.hpAtual - danoAtual) });
                } else if (entidadeNome === meuNome) {
                    updateFicha(f => { if (f.vida) f.vida.atual = Math.max(0, f.vida.atual - danoAtual); });
                    salvarFichaSilencioso();
                }
            }
        });
    }, [cenario, cenaRenderId, meuNome, updateFicha, getDanoDinamicoZona]);

    // 🔥 SALVAMENTO ISOLADO DE POSIÇÕES POR CENA 🔥
    const handleCellClick = useCallback((x, y) => {
        const z = parseInt(altitudeInput) || 0;
        
        let oldPos = null;
        if (isMestre && alvoSelecionado && dummies[alvoSelecionado]) {
            oldPos = dummies[alvoSelecionado].posicao;
        } else {
            oldPos = minhaFicha?.posicoes ? minhaFicha.posicoes[cenaRenderId] : (minhaFicha?.posicao?.cenaId === cenaRenderId ? minhaFicha.posicao : null);
        }
        
        if (isMestre && alvoSelecionado && dummies[alvoSelecionado]) {
            const d = dummies[alvoSelecionado];
            salvarDummie(alvoSelecionado, { ...d, posicao: { x, y, z }, cenaId: cenaRenderId });
            processarEntradaNaZona(oldPos, x, y, z, d.nome, true, alvoSelecionado, d);
        } else {
            updateFicha((ficha) => {
                // Guarda na nova estrutura independente
                if (!ficha.posicoes) ficha.posicoes = {};
                ficha.posicoes[cenaRenderId] = { x, y, z, cenaId: cenaRenderId };
                
                // Mantém o antigo só para segurança de outras páginas
                if (!ficha.posicao) ficha.posicao = {};
                ficha.posicao.x = x;
                ficha.posicao.y = y;
                ficha.posicao.z = z;
                ficha.posicao.cenaId = cenaRenderId; 
            });
            salvarFichaSilencioso();
            processarEntradaNaZona(oldPos, x, y, z, meuNome, false, null, null);
        }
    }, [isMestre, alvoSelecionado, dummies, cenaRenderId, altitudeInput, updateFicha, processarEntradaNaZona, meuNome, minhaFicha]);

    const alterarZoom = useCallback((direcao) => {
        setTamanhoCelula(prev => {
            let novo = prev + (direcao > 0 ? 5 : -5);
            if (novo < 15) novo = 15;
            if (novo > 80) novo = 80;
            return novo;
        });
    }, []);

    const setMinhaIniciativa = useCallback(() => {
        const val = parseInt(iniciativaInput) || 0;
        updateFicha((ficha) => {
            ficha.iniciativa = val;
            if (!ficha.posicoes) ficha.posicoes = {};
            ficha.posicoes[cenaRenderId] = { ...ficha.posicoes[cenaRenderId], cenaId: cenaRenderId }; 
        });
        salvarFichaSilencioso();
        setFeedIndexTurnoAtual(feedCombate.length); 
    }, [iniciativaInput, cenaRenderId, updateFicha, feedCombate.length]);

    const avancarTurno = useCallback(() => {
        if (ordemIniciativa.length === 0) return;
        
        let nextIndex = (cenario?.turnoAtualIndex || 0) + 1;
        if (nextIndex >= ordemIniciativa.length) nextIndex = 0;
        
        const nextPlayer = ordemIniciativa[nextIndex];
        
        setFeedIndexTurnoAtual(feedCombate.length);
        setJogadorHistory(null);

        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🔄 É a vez de ${nextPlayer.nome} agir!` });

        const storeState = useStore.getState();
        const novoCenario = JSON.parse(JSON.stringify(storeState.cenario || {}));
        novoCenario.turnoAtualIndex = nextIndex;

        if (novoCenario.zonas && novoCenario.zonas.length > 0) {
            novoCenario.zonas = novoCenario.zonas.filter(z => {
                if (z.conjurador === nextPlayer.nome) {
                    z.duracao -= 1;
                    if (z.duracao > 0 && z.danoOriginal) dispararEfeitoDaZona(z);
                    return z.duracao > 0;
                }
                return true; 
            });
        }

        salvarCenarioCompleto(novoCenario);

        if (nextPlayer.isDummie && isMestre) {
            const dData = storeState.dummies[nextPlayer.id];
            if (dData && dData.acoes) {
                const acoes = JSON.parse(JSON.stringify(dData.acoes));
                if (acoes.padrao) acoes.padrao.atual = acoes.padrao.max;
                if (acoes.bonus) acoes.bonus.atual = acoes.bonus.max;
                if (acoes.reacao) acoes.reacao.atual = acoes.reacao.max;
                salvarDummie(nextPlayer.id, { ...dData, acoes });
            }
        }
    }, [ordemIniciativa, cenario, feedCombate.length, dispararEfeitoDaZona, isMestre]);

    const prevTurnoIndex = useRef(cenario?.turnoAtualIndex || 0);

    useEffect(() => {
        const currentIndex = cenario?.turnoAtualIndex || 0;
        if (currentIndex !== prevTurnoIndex.current && ordemIniciativa.length > 0) {
            const currentActor = ordemIniciativa[currentIndex];
            if (currentActor && !currentActor.isDummie && currentActor.nome === meuNome) {
                updateFicha(f => {
                    if (!f.acoes) f.acoes = { padrao: {max:1, atual:1}, bonus: {max:1, atual:1}, reacao: {max:1, atual:1} };
                    if (f.acoes.padrao) f.acoes.padrao.atual = f.acoes.padrao.max;
                    if (f.acoes.bonus) f.acoes.bonus.atual = f.acoes.bonus.max;
                    if (f.acoes.reacao) f.acoes.reacao.atual = f.acoes.reacao.max;

                    // 😮‍💨 Fadiga de Combate: cada retorno do MEU turno na iniciativa do Mapa conta como
                    // "mais um turno de luta" — mesma unidade que o stepper manual da Ficha usava até
                    // agora (ver Ficha Def/Marcados.jsx), só que automático a partir daqui. Além do
                    // contador de turnos, soma também os pontos dinâmicos (calcularGanhoFadigaDinamico,
                    // ver core/fadiga.js) calculados a partir de QUÃO gasto/ferido/transformado o
                    // personagem está ENTRANDO neste turno — por isso roda ANTES da Regeneração logo
                    // abaixo, senão a cura já aplicada esconderia o desgaste real deste turno.
                    if (!f.combate) f.combate = {};
                    f.combate.fadigaTurnos = Math.max(0, (Number(f.combate.fadigaTurnos) || 0) + 1);
                    f.combate.fadigaExtra = Math.max(0, (Number(f.combate.fadigaExtra) || 0) + calcularGanhoFadigaDinamico(f));

                    // 💖 Regeneração: mesma regra do botão "Regenerar" da página de Status, aplicada
                    // sozinha sempre que meu turno volta.
                    aplicarRegeneracaoDeTurno(f);
                });
                salvarFichaSilencioso();
            }
            prevTurnoIndex.current = currentIndex;
        }
    }, [cenario?.turnoAtualIndex, ordemIniciativa, meuNome, updateFicha]);

    const sairDoCombate = useCallback(() => {
        updateFicha(ficha => { ficha.iniciativa = 0; });
        setIniciativaInput(0);
        salvarFichaSilencioso();
        setJogadorHistory(null);
    }, [updateFicha]);

    // 💖 Descansar: mesma ação do botão "Descansar" da Ficha (cura tudo + zera Fadiga/mUnico
    // Crescente), só que direto do Mapa — pra o jogador não precisar voltar pra Ficha só pra
    // encerrar o desgaste acumulado de uma luta antes da próxima. Só mexe na PRÓPRIA ficha (mesma
    // limitação de toda mutação no Mapa: cada cliente só grava a si mesmo no Firebase).
    const descansar = useCallback(() => {
        if (!window.confirm('Recuperar toda a Vida/Energias e zerar a Fadiga e o mUnico Crescente acumulados?')) return;
        updateFicha(f => { descansarCompleto(f); });
        salvarFichaSilencioso();
        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `💖 ${meuNome} descansou e recuperou as forças!` });
    }, [updateFicha, meuNome]);

    // ⚔️ Dano Rápido do Mestre: aplica dano direto num jogador OU numa entidade (dummie), sem
    // precisar que o alvo digite nada manualmente. Dummies já aceitam escrita de qualquer
    // cliente (salvarDummie); jogadores usam aplicarDanoDireto (escrita pontual em vida/atual,
    // mesma ideia de zerarIniciativaGlobal) quando o alvo NÃO é quem está clicando — se for o
    // próprio Mestre se auto-aplicando dano, usa o caminho normal (updateFicha) da própria ficha.
    const aplicarDanoRapido = useCallback((alvo, dano) => {
        if (!isMestre || !alvo) return;
        const valor = Math.max(0, Math.floor(Number(dano)) || 0);
        if (valor <= 0) return;

        if (alvo.isDummie) {
            const storeState = useStore.getState();
            const dData = storeState.dummies[alvo.id];
            if (!dData) return;
            salvarDummie(alvo.id, { ...dData, hpAtual: Math.max(0, (dData.hpAtual || 0) - valor) });
        } else if (alvo.nome === meuNome) {
            updateFicha(f => { if (f.vida) f.vida.atual = Math.max(0, (f.vida.atual || 0) - valor); });
            salvarFichaSilencioso();
        } else {
            const atualAlvo = alvo.ficha?.vida?.atual || 0;
            aplicarDanoDireto(alvo.nome, atualAlvo - valor);
        }

        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `⚔️ O Mestre aplicou ${valor} de dano em ${alvo.nome}!` });
    }, [isMestre, meuNome, updateFicha]);

    const encerrarCombate = useCallback(() => {
        if (!window.confirm(`Tem a certeza que deseja ZERAR A INICIATIVA DE TODOS OS JOGADORES E ENTIDADES presentes na cena "${cenaAtual.nome}"?`)) return;
        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `⚔️ O COMBATE EM ${cenaAtual.nome.toUpperCase()} FOI ENCERRADO PELO MESTRE! ⚔️` });
        
        const nomesNaCena = ordemIniciativa.filter(j => !j.isDummie).map(j => j.nome);
        if (nomesNaCena.length > 0) zerarIniciativaGlobal(nomesNaCena);

        const storeState = useStore.getState();
        ordemIniciativa.filter(j => j.isDummie).forEach(d => {
            const dData = storeState.dummies[d.id];
            if (dData) salvarDummie(d.id, { ...dData, iniciativa: 0 });
        });

        updateFicha(ficha => { ficha.iniciativa = 0; });
        setIniciativaInput(0);
        salvarFichaSilencioso();
        setJogadorHistory(null);
        
        const novoCenario = JSON.parse(JSON.stringify(storeState.cenario || {}));
        novoCenario.turnoAtualIndex = 0;
        salvarCenarioCompleto(novoCenario);

    }, [cenaAtual.nome, ordemIniciativa, updateFicha]);

    const rolarAcertoRapido = useCallback(() => {
        const qD = parseInt(mapQD) || 1;
        const fD = parseInt(mapFD) || 20;
        const bonus = parseInt(mapBonus) || 0;
        const prof = mapUsarProf ? profGlobal : 0;
        const sels = [mapStat]; 
        const itensEq = fichaSegura?.inventario ? fichaSegura.inventario.filter(i => i.equipado) : [];

        const result = calcularAcerto({ 
            qD, fD, prof, bonus, sels, minhaFicha: fichaSegura, itensEquipados: itensEq, 
            vantagens: mapVantagens, desvantagens: mapDesvantagens 
        });

        let alvosAtingidos = [];
        let maxArea = 0;
        const alvoDummie = alvoSelecionado && dummies[alvoSelecionado] ? dummies[alvoSelecionado] : null;

        if (alvoDummie) {
            const armasEqMap = itensEq.filter(i => i.tipo === 'arma');
            const maxAreaArmas = armasEqMap.length > 0 ? Math.max(...armasEqMap.map(a => a.areaQuad || a.area || 0)) : 0;
            
            const podAtMap = (fichaSegura?.poderes || []).filter(p => p.ativa);
            const maxAreaPoderes = podAtMap.length > 0 ? Math.max(...podAtMap.map(p => p.areaQuad || p.area || 0)) : 0;
            
            const magiasEqMap = (fichaSegura?.ataquesElementais || []).filter(m => m.equipado);
            const maxAreaMagias = magiasEqMap.length > 0 ? Math.max(...magiasEqMap.map(m => m.areaQuad || 0)) : 0;

            maxArea = Math.max(maxAreaArmas, maxAreaPoderes, maxAreaMagias);

            if (maxArea > 0) {
                const cenaAtivaId = cenario?.ativa || 'default';
                const escala = cenario?.lista?.[cenaAtivaId]?.escala || 1.5;

                Object.entries(dummies).forEach(([id, dObj]) => {
                    const isSameScene = (dObj.cenaId || 'default') === (alvoDummie.cenaId || 'default');
                    if (isSameScene && dObj.posicao && alvoDummie.posicao) {
                        const dX = Math.abs(dObj.posicao.x - alvoDummie.posicao.x);
                        const dY = Math.abs(dObj.posicao.y - alvoDummie.posicao.y);
                        const dZ = Math.floor(Math.abs((dObj.posicao.z || 0) - (alvoDummie.posicao.z || 0)) / escala);
                        
                        if (Math.max(dX, dY, dZ) <= maxArea) {
                            alvosAtingidos.push({ nome: dObj.nome, defesa: dObj.valorDefesa, acertou: result.acertoTotal >= dObj.valorDefesa });
                        }
                    }
                });
            } else {
                alvosAtingidos.push({ nome: alvoDummie.nome, defesa: alvoDummie.valorDefesa, acertou: result.acertoTotal >= alvoDummie.valorDefesa });
            }
        }

        const feedData = { tipo: 'acerto', nome: meuNome, ...result, alvosArea: alvosAtingidos, areaEf: maxArea };
        enviarParaFeed(feedData); 
    }, [mapQD, mapFD, mapBonus, mapUsarProf, profGlobal, mapStat, fichaSegura, mapVantagens, mapDesvantagens, alvoSelecionado, dummies, meuNome, cenario]);

    const jogadorDaVez = ordemIniciativa.length > 0 ? ordemIniciativa[turnoAtualIndex % ordemIniciativa.length] : null;
    const infoDaVez = jogadorDaVez ? getAvatarInfo(jogadorDaVez.ficha) : null;

    const value = useMemo(() => ({
        minhaFicha, meuNome, personagens, feedCombate, isMestre, souCriador, dummies, alvoSelecionado, cenario, abaAtiva,
        fichaSegura, modo3D, setModo3D, tamanhoCelula, setTamanhoCelula,
        iniciativaInput, setIniciativaInput, altitudeInput, setAltitudeInput,
        turnoAtualIndex, feedIndexTurnoAtual, setFeedIndexTurnoAtual,
        jogadorHistory, setJogadorHistory, mapQD, setMapQD, mapFD, setMapFD,
        mapBonus, setMapBonus, mapStat, setMapStat, mapUsarProf, setMapUsarProf,
        profGlobal, mapVantagens, setMapVantagens, mapDesvantagens, setMapDesvantagens,
        novaCenaNome, setNovaCenaNome, novaCenaEscala, setNovaCenaEscala,
        novaCenaUnidade, setNovaCenaUnidade, novaCenaApenasCriador, setNovaCenaApenasCriador,
        uploadingMap, setUploadingMap,
        dadoAnim, setDadoAnim, cenaVisualizadaId, setCenaVisualizadaId,
        cenaAtivaIdGlobal, cenaRenderId, cenaAtual, isModoRP, mestreVendoRP, setMestreVendoRP,
        tavernaAtivos, isPresenteNaTaverna, overridesCompendio,
        toggleModoRP, togglePresencaTaverna, changeVantagem, changeDesvantagem,
        handleUploadNovaCena, ativarCena, deletarCena, corDoJogador, getAvatarInfo,
        cells, jogadores, playersNaTaverna, ordemIniciativa, handleCellClick,
        alterarZoom, setMinhaIniciativa, avancarTurno, sairDoCombate, encerrarCombate, descansar, aplicarDanoRapido,
        rolarAcertoRapido, tokenMap, dummyMap, tokens3D, jogadorDaVez, infoDaVez, fmt, deletarZona, toggleActionDot
    }), [
        minhaFicha, meuNome, personagens, feedCombate, isMestre, souCriador, dummies, alvoSelecionado, cenario, abaAtiva,
        fichaSegura, modo3D, tamanhoCelula, iniciativaInput, altitudeInput,
        turnoAtualIndex, feedIndexTurnoAtual, jogadorHistory, mapQD, mapFD,
        mapBonus, mapStat, mapUsarProf, profGlobal, mapVantagens, mapDesvantagens,
        novaCenaNome, novaCenaEscala, novaCenaUnidade, novaCenaApenasCriador, uploadingMap, dadoAnim,
        cenaVisualizadaId, cenaAtivaIdGlobal, cenaRenderId, cenaAtual, isModoRP,
        mestreVendoRP, tavernaAtivos, isPresenteNaTaverna, overridesCompendio,
        cells, jogadores, playersNaTaverna, ordemIniciativa, tokenMap, dummyMap, tokens3D,
        jogadorDaVez, infoDaVez, fmt, toggleModoRP, togglePresencaTaverna, changeVantagem,
        changeDesvantagem, handleUploadNovaCena, ativarCena, deletarCena, corDoJogador, descansar, aplicarDanoRapido,
        getAvatarInfo, handleCellClick, alterarZoom, setMinhaIniciativa, avancarTurno,
        sairDoCombate, encerrarCombate, rolarAcertoRapido, deletarZona, toggleActionDot
    ]);

    return (
        <MapaFormContext.Provider value={value}>
            {children}
        </MapaFormContext.Provider>
    );
}