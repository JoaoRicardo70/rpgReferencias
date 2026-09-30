import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ref, set, get } from 'firebase/database';
import { db } from '../../services/firebase-config';
import useStore from '../../stores/useStore';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';
import {
    MODELO_GEMINI_PADRAO, montarHistoricoGemini,
    adicionarMensagemUsuario, selecionarLoreRelevante, montarInstrucaoSistema,
} from '../../core/sextaFeira';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { DECLARACOES_FERRAMENTAS, executarFerramenta, montarContextoInicial } from '../../core/sextaFeiraFerramentas';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// --- GERADOR DE RANKS ---
export const baseRanks = [
    { id: 'EX', cor: '#ffffff', text: '#000' },
    { id: 'Z+', cor: '#e040fb', text: '#000' }, { id: 'Z', cor: '#aa00ff', text: '#fff' }, { id: 'Z-', cor: '#7b1fa2', text: '#fff' },
    { id: 'S+', cor: '#ff5252', text: '#000' }, { id: 'S', cor: '#ff003c', text: '#fff' }, { id: 'S-', cor: '#c50000', text: '#fff' },
    { id: 'A+', cor: '#ffff00', text: '#000' }, { id: 'A', cor: '#ffcc00', text: '#000' }, { id: 'A-', cor: '#f57f17', text: '#000' },
    { id: 'B+', cor: '#18ffff', text: '#000' }, { id: 'B', cor: '#00ffcc', text: '#000' }, { id: 'B-', cor: '#00b8d4', text: '#000' },
    { id: 'C+', cor: '#448aff', text: '#000' }, { id: 'C', cor: '#0088ff', text: '#fff' }, { id: 'C-', cor: '#01579b', text: '#fff' },
    { id: 'D+', cor: '#69f0ae', text: '#000' }, { id: 'D', cor: '#00e676', text: '#000' }, { id: 'D-', cor: '#00c853', text: '#000' },
];

export const extendedLetters = ['E','F','G','H','I','J','K','L','M','N','O','P','Q','R'];
export const extendedRanks = [];
extendedLetters.forEach((letra, i) => {
    const val = Math.max(40, 140 - (i * 7)); 
    const hex = val.toString(16).padStart(2, '0');
    const cor = `#${hex}${hex}${hex}`; 
    extendedRanks.push({ id: `${letra}+`, cor: cor, text: '#fff' });
    extendedRanks.push({ id: `${letra}`, cor: cor, text: '#fff' });
    extendedRanks.push({ id: `${letra}-`, cor: cor, text: '#fff' });
});
export const TODOS_RANKS = [...baseRanks, ...extendedRanks];

const AIFormContext = createContext(null);

export function useAIForm() {
    const ctx = useContext(AIFormContext);
    if (!ctx) return null;
    return ctx;
}

export function AIFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const meuNome = useStore(s => s.meuNome) || 'Desconhecido';
    const personagens = useStore(s => s.personagens) || {};
    const poderesGlobais = useStore(s => s.poderes) || {};
    const habilidadesGlobais = useStore(s => s.habilidades) || {};
    const formasGlobais = useStore(s => s.formas) || {};
    const inventarioGlobal = useStore(s => s.inventario) || {};
    const mesaId = useStore(s => s.mesaId);
    const isMestre = useStore(s => s.isMestre);
    const sextaFeiraConfig = useStore(s => s.sextaFeiraConfig);
    const registrosCompartilhados = useStore(s => s.registrosCompartilhados);

    // 🔒 Registros da mesa (hooks/useSextaFeiraMesa.js): só Mestre/Co-Mestre editam, e o Futuro
    // ("Ecos do Futuro") é só deles. Sem Registros na mesa, cada um edita os seus, como antes.
    const podeEditarRegistros = isMestre || !registrosCompartilhados;
    const podeVerFuturo = isMestre || !registrosCompartilhados;
    const iaConfigurada = !!(sextaFeiraConfig && sextaFeiraConfig.chaveGemini);

    const [subAba, setSubAba] = useState('chat');
    const [mensagem, setMensagem] = useState('');
    const [historico, setHistorico] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [arquivoTexto, setArquivoTexto] = useState('');
    const [nomeArquivo, setNomeArquivo] = useState('');
    const chatRef = useRef(null);
    const fileInputRef = useRef(null);

    const [loreFoco, setLoreFoco] = useState('presente');
    const [novoPersonagem, setNovoPersonagem] = useState('');
    const [novoAvatar, setNovoAvatar] = useState('');

    // 🔥 PONTE DEFINITIVA: capítulos/arcos vivem no Zustand (useStore.js), fonte única
    // compartilhada com o HUD MapaSextaFeira — nada de localStorage/CustomEvent aqui.
    const capitulosPresente = useStore(s => s.loreCapitulosPresente);
    const setCapitulosPresente = useStore(s => s.setLoreCapitulosPresente);
    const capituloAtivoId = useStore(s => s.loreCapituloAtivoId);
    const setCapituloAtivoId = useStore(s => s.setLoreCapituloAtivoId);
    const arcoAtivoIdPresente = useStore(s => s.loreArcoAtivoIdPresente);
    const setArcoAtivoIdPresente = useStore(s => s.setLoreArcoAtivoIdPresente);

    const capitulosFuturo = useStore(s => s.loreCapitulosFuturo);
    const setCapitulosFuturo = useStore(s => s.setLoreCapitulosFuturo);
    const capFuturoAtivoId = useStore(s => s.loreCapFuturoAtivoId);
    const setCapFuturoAtivoId = useStore(s => s.setLoreCapFuturoAtivoId);
    const arcoAtivoIdFuturo = useStore(s => s.loreArcoAtivoIdFuturo);
    const setArcoAtivoIdFuturo = useStore(s => s.setLoreArcoAtivoIdFuturo);

    useEffect(() => {
        const cap = capitulosPresente.find(c => c.id === capituloAtivoId);
        if (cap && cap.arcos.length > 0 && !cap.arcos.some(a => a.id === arcoAtivoIdPresente)) setArcoAtivoIdPresente(cap.arcos[0].id);
    }, [capituloAtivoId, capitulosPresente, arcoAtivoIdPresente]);

    useEffect(() => {
        const cap = capitulosFuturo.find(c => c.id === capFuturoAtivoId);
        if (cap && cap.arcos.length > 0 && !cap.arcos.some(a => a.id === arcoAtivoIdFuturo)) setArcoAtivoIdFuturo(cap.arcos[0].id);
    }, [capFuturoAtivoId, capitulosFuturo, arcoAtivoIdFuturo]);

    const capituloAtivoObj = useMemo(() => loreFoco === 'presente' ? capitulosPresente.find(cap => cap.id === capituloAtivoId) : capitulosFuturo.find(cap => cap.id === capFuturoAtivoId), [loreFoco, capitulosPresente, capituloAtivoId, capitulosFuturo, capFuturoAtivoId]);
    
    const arcoAtivoObj = useMemo(() => {
        const arcId = loreFoco === 'presente' ? arcoAtivoIdPresente : arcoAtivoIdFuturo;
        return capituloAtivoObj?.arcos?.find(a => a.id === arcId) || capituloAtivoObj?.arcos?.[0];
    }, [capituloAtivoObj, loreFoco, arcoAtivoIdPresente, arcoAtivoIdFuturo]);

    useEffect(() => {
        if (!podeVerFuturo && loreFoco !== 'presente') setLoreFoco('presente');
    }, [podeVerFuturo, loreFoco]);

    const textoAtivo = arcoAtivoObj?.texto || '';
    const tierListAtiva = capituloAtivoObj?.tierList || [];

    useEffect(() => {
        if (meuNome) {
            try {
                const salvo = localStorage.getItem(`rpgSextaFeira_chat_${meuNome}`);
                if (salvo) setHistorico(JSON.parse(salvo));
                else setHistorico([]); 
            } catch(e) { setHistorico([]); }
        }
    }, [meuNome]);

    useEffect(() => { if (meuNome) localStorage.setItem(`rpgSextaFeira_chat_${meuNome}`, JSON.stringify(historico)); }, [historico, meuNome]);

    useEffect(() => {
        localStorage.setItem('rpgSextaFeira_capitulos', JSON.stringify(capitulosPresente));
        localStorage.setItem('rpgSextaFeira_capituloAtivo', capituloAtivoId);
        localStorage.setItem('rpgSextaFeira_arcoAtivoPresente', arcoAtivoIdPresente);
        localStorage.setItem('rpgSextaFeira_capitulosFuturo', JSON.stringify(capitulosFuturo));
        localStorage.setItem('rpgSextaFeira_capFuturoAtivo', capFuturoAtivoId);
        localStorage.setItem('rpgSextaFeira_arcoAtivoFuturo', arcoAtivoIdFuturo);
    }, [capitulosPresente, capituloAtivoId, arcoAtivoIdPresente, capitulosFuturo, capFuturoAtivoId, arcoAtivoIdFuturo]);

    const limparChat = useCallback(() => {
        if (window.confirm("Deseja formatar a memória desta conversa? A Sexta-Feira esquecerá tudo o que falaram aqui.")) {
            setHistorico([]); localStorage.removeItem(`rpgSextaFeira_chat_${meuNome}`);
        }
    }, [meuNome]);

    const poolPersonagens = useMemo(() => {
        const avataresDoServidor = [];
        const nomesJaAdicionados = new Set();
        const extrairUrl = (img) => {
            if (!img) return '';
            if (typeof img === 'string') return img.trim();
            if (typeof img === 'object') {
                const url = img.base || img.downloadURL || img.downloadUrl || img.url || img.link || img.src || img.imagem || img.img || img.foto || img.icon || img.uri || img.capa || Object.values(img).find(v => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:'))) || '';
                return typeof url === 'string' ? url.trim() : '';
            }
            return '';
        };

        const varrerGaveta = (gaveta, nomeDono) => {
            if (!gaveta) return;
            const itens = Array.isArray(gaveta) ? gaveta : Object.values(gaveta);
            itens.forEach(item => {
                if (!item || typeof item !== 'object') return;
                const nomeObj = item.nome || item.titulo || item.name;
                const imgObj = item.imagemUrl || item.imagem || item.icone || item.avatar || item.url || item.img || item.foto || item.icon || item.token || item.capa;
                if (nomeObj && typeof nomeObj === 'string' && imgObj) {
                    const url = extrairUrl(imgObj);
                    if (url) {
                        const jaTemNome = nomeDono && nomeObj.toLowerCase().includes(nomeDono.toLowerCase().split(' ')[0]);
                        const nomeCombo = (nomeDono && !jaTemNome) ? `${nomeDono} (${nomeObj})` : nomeObj;
                        if (!nomesJaAdicionados.has(nomeCombo)) {
                            avataresDoServidor.push({ nome: nomeCombo, avatar: url });
                            nomesJaAdicionados.add(nomeCombo);
                        }
                    }
                }
                Object.values(item).forEach(sub => {
                    if (sub && typeof sub === 'object') {
                        if (sub.$$typeof) return;
                        varrerGaveta(Array.isArray(sub) ? sub : [sub], nomeDono);
                    }
                });
            });
        };

        if (minhaFicha) {
            const urlBase = extrairUrl(minhaFicha.avatar || minhaFicha.bio?.avatar || minhaFicha.token || minhaFicha.imagem || minhaFicha.img);
            if (urlBase && !nomesJaAdicionados.has(meuNome)) { avataresDoServidor.push({ nome: meuNome, avatar: urlBase }); nomesJaAdicionados.add(meuNome); }
            varrerGaveta(minhaFicha, meuNome);
        }

        Object.entries(personagens).forEach(([nomeFicha, ficha]) => {
            const urlBase = extrairUrl(ficha.avatar || ficha.bio?.avatar || ficha.token || ficha.imagem || ficha.img);
            if (urlBase && !nomesJaAdicionados.has(nomeFicha)) { avataresDoServidor.push({ nome: nomeFicha, avatar: urlBase }); nomesJaAdicionados.add(nomeFicha); }
            varrerGaveta(ficha, nomeFicha);
        });

        varrerGaveta(poderesGlobais, meuNome); varrerGaveta(habilidadesGlobais, meuNome); varrerGaveta(formasGlobais, meuNome); varrerGaveta(inventarioGlobal, meuNome);
        return avataresDoServidor.filter(srvPers => srvPers.avatar !== '').filter(srvPers => !tierListAtiva.some(tPers => tPers.nome === srvPers.nome));
    }, [minhaFicha, meuNome, personagens, poderesGlobais, habilidadesGlobais, formasGlobais, inventarioGlobal, tierListAtiva]);

    const moverPersonagem = useCallback((personagem, novoRank) => {
        if (!podeEditarRegistros) return;
        const isPresente = loreFoco === 'presente';
        const setCapitulos = isPresente ? setCapitulosPresente : setCapitulosFuturo;
        const ativoId = isPresente ? capituloAtivoId : capFuturoAtivoId;
        setCapitulos(prev => prev.map(cap => {
            if (cap.id !== ativoId) return cap;
            let novaTierList = cap.tierList.filter(p => p.nome !== personagem.nome);
            if (novoRank !== 'pool') novaTierList.push({ ...personagem, rank: novoRank });
            return { ...cap, tierList: novaTierList };
        }));
    }, [loreFoco, capituloAtivoId, capFuturoAtivoId, podeEditarRegistros]);

    const handleDragStart = useCallback((e, personagem) => { e.dataTransfer.setData('personagem', JSON.stringify(personagem)); e.dataTransfer.effectAllowed = 'move'; }, []);
    const handleDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
    const handleDrop = useCallback((e, novoRank) => { e.preventDefault(); const data = e.dataTransfer.getData('personagem'); if (data) moverPersonagem(JSON.parse(data), novoRank); }, [moverPersonagem]);

    const adicionarCustomizado = useCallback(() => {
        if (!novoPersonagem.trim()) return;
        moverPersonagem({ nome: novoPersonagem.trim(), avatar: novoAvatar.trim() }, 'C');
        setNovoPersonagem(''); setNovoAvatar('');
    }, [novoPersonagem, novoAvatar, moverPersonagem]);

    const adicionarCapitulo = useCallback(() => {
        if (!podeEditarRegistros) return;
        const tituloCap = window.prompt(`Nome do novo Capítulo para o ${loreFoco}:`);
        if (!tituloCap || tituloCap.trim() === '') return;
        const tituloArco = window.prompt(`Nome do primeiro Arco deste Capítulo:`, "Arco 1");
        if (!tituloArco || tituloArco.trim() === '') return;
        
        const novoCapId = Date.now();
        const novoArcoId = Date.now() + 1;
        const novoCap = { id: novoCapId, titulo: tituloCap, tierList: [], arcos: [{ id: novoArcoId, titulo: tituloArco, texto: '' }] };
        
        if (loreFoco === 'presente') { setCapitulosPresente(prev => [...prev, novoCap]); setCapituloAtivoId(novoCapId); setArcoAtivoIdPresente(novoArcoId); }
        else { setCapitulosFuturo(prev => [...prev, novoCap]); setCapFuturoAtivoId(novoCapId); setArcoAtivoIdFuturo(novoArcoId); }
    }, [loreFoco, podeEditarRegistros]);

    const editarTituloCapitulo = useCallback(() => {
        if (!podeEditarRegistros) return;
        const novoTitulo = window.prompt("Editar nome do Capítulo:", capituloAtivoObj?.titulo);
        if (!novoTitulo || novoTitulo.trim() === '') return;
        const idAtivo = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        if (loreFoco === 'presente') setCapitulosPresente(prev => prev.map(cap => cap.id === idAtivo ? { ...cap, titulo: novoTitulo } : cap));
        else setCapitulosFuturo(prev => prev.map(cap => cap.id === idAtivo ? { ...cap, titulo: novoTitulo } : cap));
    }, [loreFoco, capituloAtivoObj, capituloAtivoId, capFuturoAtivoId, podeEditarRegistros]);

    const apagarCapitulo = useCallback(() => {
        if (!podeEditarRegistros) return;
        const lista = loreFoco === 'presente' ? capitulosPresente : capitulosFuturo;
        if (lista.length <= 1) return alert("Não pode apagar o único Capítulo existente!");
        const idAtivo = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        if (!window.confirm("Tem certeza que deseja apagar este Capítulo INTEIRO e todos os seus Arcos?")) return;
        if (loreFoco === 'presente') {
            const nova = capitulosPresente.filter(cap => cap.id !== idAtivo);
            setCapitulosPresente(nova); setCapituloAtivoId(nova[0].id); setArcoAtivoIdPresente(nova[0].arcos[0].id);
        } else {
            const nova = capitulosFuturo.filter(cap => cap.id !== idAtivo);
            setCapitulosFuturo(nova); setCapFuturoAtivoId(nova[0].id); setArcoAtivoIdFuturo(nova[0].arcos[0].id);
        }
    }, [loreFoco, capitulosPresente, capitulosFuturo, capituloAtivoId, capFuturoAtivoId, podeEditarRegistros]);

    const adicionarArco = useCallback(() => {
        if (!podeEditarRegistros) return;
        const titulo = window.prompt(`Nome do novo Arco:`);
        if (!titulo || titulo.trim() === '') return;
        const novoId = Date.now();
        const idAtivo = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        
        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        setCaps(prev => prev.map(c => {
            if (c.id === idAtivo) return { ...c, arcos: [...c.arcos, { id: novoId, titulo, texto: '' }] };
            return c;
        }));
        if (loreFoco === 'presente') setArcoAtivoIdPresente(novoId); else setArcoAtivoIdFuturo(novoId);
    }, [loreFoco, capituloAtivoId, capFuturoAtivoId, podeEditarRegistros]);

    const editarTituloArco = useCallback(() => {
        if (!podeEditarRegistros) return;
        const novoTitulo = window.prompt("Editar nome do Arco:", arcoAtivoObj?.titulo);
        if (!novoTitulo || novoTitulo.trim() === '') return;
        const capId = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        const arcId = loreFoco === 'presente' ? arcoAtivoIdPresente : arcoAtivoIdFuturo;
        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        
        setCaps(prev => prev.map(c => {
            if (c.id === capId) return { ...c, arcos: c.arcos.map(a => a.id === arcId ? { ...a, titulo: novoTitulo } : a) };
            return c;
        }));
    }, [loreFoco, arcoAtivoObj, capituloAtivoId, capFuturoAtivoId, arcoAtivoIdPresente, arcoAtivoIdFuturo, podeEditarRegistros]);

    const apagarArco = useCallback(() => {
        if (!podeEditarRegistros) return;
        if (capituloAtivoObj?.arcos.length <= 1) return alert("Um Capítulo deve ter pelo menos um Arco!");
        if (!window.confirm("Tem certeza que deseja apagar este Arco?")) return;
        const capId = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        const arcId = loreFoco === 'presente' ? arcoAtivoIdPresente : arcoAtivoIdFuturo;
        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        
        setCaps(prev => prev.map(c => {
            if (c.id === capId) {
                const novosArcos = c.arcos.filter(a => a.id !== arcId);
                if (loreFoco === 'presente') setArcoAtivoIdPresente(novosArcos[0].id); else setArcoAtivoIdFuturo(novosArcos[0].id);
                return { ...c, arcos: novosArcos };
            }
            return c;
        }));
    }, [loreFoco, capituloAtivoObj, capituloAtivoId, capFuturoAtivoId, arcoAtivoIdPresente, arcoAtivoIdFuturo, podeEditarRegistros]);

    const atualizarTexto = useCallback((novoTexto) => {
        if (!podeEditarRegistros) return;
        const capId = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        const arcId = loreFoco === 'presente' ? arcoAtivoIdPresente : arcoAtivoIdFuturo;
        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        setCaps(prev => prev.map(c => {
            if (c.id === capId) return { ...c, arcos: c.arcos.map(a => a.id === arcId ? { ...a, texto: novoTexto } : a) };
            return c;
        }));
    }, [loreFoco, capituloAtivoId, capFuturoAtivoId, arcoAtivoIdPresente, arcoAtivoIdFuturo, podeEditarRegistros]);

    const salvarNoRegistro = useCallback((texto, tituloRegistro, destinoVal, foco = 'presente') => {
        if (!podeEditarRegistros) return false;
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        const separador = `\n\n================================\n[${tituloRegistro} - ${timestamp}]\n================================\n\n`;

        const setCaps = foco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        const setCapAtivo = foco === 'presente' ? setCapituloAtivoId : setCapFuturoAtivoId;
        const setArcAtivo = foco === 'presente' ? setArcoAtivoIdPresente : setArcoAtivoIdFuturo;

        if (destinoVal === 'novo_capitulo') {
            const nomeCap = window.prompt("Nome do NOVO CAPÍTULO?");
            if (!nomeCap) return false;
            const nomeArco = window.prompt("Nome do PRIMEIRO ARCO deste capítulo?", "Arco 1");
            if (!nomeArco) return false;
            const newCapId = Date.now();
            const newArcId = Date.now() + 1;
            setCaps(prev => [...prev, { id: newCapId, titulo: nomeCap, tierList: [], arcos: [{ id: newArcId, titulo: nomeArco, texto: texto }] }]);
            setCapAtivo(newCapId); setArcAtivo(newArcId); setLoreFoco(foco);
        } else if (destinoVal.startsWith('novo_arco_')) {
            const capId = Number(destinoVal.replace('novo_arco_', ''));
            const nomeArco = window.prompt("Nome do NOVO ARCO?");
            if (!nomeArco) return false;
            const newArcId = Date.now();
            setCaps(prev => prev.map(c => {
                if (c.id === capId) return { ...c, arcos: [...c.arcos, { id: newArcId, titulo: nomeArco, texto: texto }] };
                return c;
            }));
            setCapAtivo(capId); setArcAtivo(newArcId); setLoreFoco(foco);
        } else {
            const [capIdStr, arcIdStr] = destinoVal.split('_');
            const capId = Number(capIdStr); const arcId = Number(arcIdStr);
            setCaps(prev => prev.map(c => {
                if (c.id === capId) {
                    return { ...c, arcos: c.arcos.map(a => {
                        if (a.id === arcId) {
                            const newTexto = a.texto.trim() ? a.texto + separador + texto : texto;
                            return { ...a, texto: newTexto };
                        }
                        return a;
                    })};
                }
                return c;
            }));
            setCapAtivo(capId); setArcAtivo(arcId); setLoreFoco(foco);
        }
        return true;
    }, [podeEditarRegistros, setCapitulosPresente, setCapituloAtivoId, setArcoAtivoIdPresente, setCapitulosFuturo, setCapFuturoAtivoId, setArcoAtivoIdFuturo, setLoreFoco]);

    useEffect(() => { if (subAba === 'chat' && chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [historico, subAba]);

    const extrairTextoPDF = useCallback(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let textoCompleto = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            textoCompleto += content.items.map(item => item.str).join(' ') + '\n';
        }
        return textoCompleto;
    }, []);

    const handleArquivoSelecionado = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            let texto = '';
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) texto = await extrairTextoPDF(file);
            else if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) texto = await file.text();
            else return alert('Formato não suportado. Use PDF, TXT ou MD.');
            
            const MAX_CHARS = 15000;
            if (texto.length > MAX_CHARS) texto = texto.substring(0, MAX_CHARS) + '\n...[TEXTO TRUNCADO]';
            setArquivoTexto(texto); setNomeArquivo(file.name);
        } catch (err) { alert('Erro ao ler o arquivo.'); } 
        finally { e.target.value = ''; }
    }, [extrairTextoPDF]);

    const montarContextoFicha = useCallback(() => {
        if (!minhaFicha) return { nome: meuNome };
        const bio = minhaFicha.bio || {};
        
        const formatarItem = (i) => {
            const raridade = i.raridade || 'Comum';
            const tipo = i.armaTipo || i.tipo || 'Item';
            const dano = (i.dadosQtd && i.dadosQtd > 0) ? `${i.dadosQtd}d${i.dadosFaces||20}` : 'SemDados';
            return `${i.nome}[${raridade}/${tipo}/Dano:${dano}]`;
        };

        const inventarioDeArmas = (minhaFicha.inventario || []).filter(i => i.tipo === 'arma');
        const armasEquipadas = inventarioDeArmas.filter(i => i.equipado).map(formatarItem);
        const armasGuardadas = inventarioDeArmas.filter(i => !i.equipado).map(formatarItem);

        const magiasPreparadas = (minhaFicha.ataquesElementais || []).filter(m => m.equipado).map(m => `${m.nome}[${m.elemento||'Neutro'}]`);
        const poderesAtivos = (minhaFicha.poderes || []).filter(p => p.ativa).map(p => `${p.nome}[${p.vertente||'Padrão'}]`);

        return {
            dadosPersonagem: { nome: meuNome, raca: bio.raca || 'N/A', classe: bio.classe || 'N/A' },
            statusVitais: { hp: (minhaFicha.vida?.atual||0) / FATOR_EXIBICAO_VITAIS, mana: (minhaFicha.mana?.atual||0) / FATOR_EXIBICAO_VITAIS, aura: (minhaFicha.aura?.atual||0) / FATOR_EXIBICAO_VITAIS },
            combate: {
                armasEquipadas: armasEquipadas.length > 0 ? armasEquipadas : ['Desarmado'],
                armasGuardadas: armasGuardadas.length > 0 ? armasGuardadas : ['Vazio'],
                magiasPreparadas: magiasPreparadas.length > 0 ? magiasPreparadas : ['Nenhuma'],
                poderesAtivos: poderesAtivos.length > 0 ? poderesAtivos : ['Nenhum']
            }
        };
    }, [minhaFicha, meuNome]);

    const enviarMensagem = useCallback(async () => {
        if ((!mensagem.trim() && !arquivoTexto) || carregando) return;
        const msgUsuario = mensagem.trim();
        const textoAnexo = arquivoTexto;
        const nomeAnexo = nomeArquivo;

        if (!iaConfigurada) {
            setHistorico(prev => [...prev, { role: 'erro', texto: isMestre
                ? 'A Sexta-Feira ainda não tem uma chave do Gemini. Abra ⚙️ Config nesta aba e cadastre a chave.'
                : 'A Sexta-Feira ainda não foi configurada pelo Mestre desta mesa.' }]);
            return;
        }

        setMensagem(''); setArquivoTexto(''); setNomeArquivo('');

        const displayMsg = nomeAnexo ? `${msgUsuario || 'Analise o documento anexado.'}\n📄 [Arquivo: ${nomeAnexo}]` : msgUsuario;
        // Histórico ANTES desta mensagem: vai junto pro Gemini como memória da conversa.
        const historicoAnterior = historico;
        setHistorico(prev => [...prev, { role: 'user', texto: displayMsg }]);
        setCarregando(true);

        try {
            // Jogadores não recebem trechos do Futuro (spoilers) quando os Registros são da mesa.
            const capitulosParaIA = podeVerFuturo ? [...capitulosPresente, ...capitulosFuturo] : capitulosPresente;
            const textoArcoParaIA = (loreFoco === 'futuro' && !podeVerFuturo) ? '' : (arcoAtivoObj?.texto || '');
            const lore = selecionarLoreRelevante(capitulosParaIA, msgUsuario, textoArcoParaIA);
            // 🛠️ Estado da mesa no momento do envio: as ferramentas (core/sextaFeiraFerramentas.js)
            // leem daqui, já filtrando pelo papel de quem pergunta.
            const loja = useStore.getState();
            const estadoMesa = {
                meuNome, isMestre, podeVerFuturo,
                minhaFicha: loja.minhaFicha, personagens: loja.personagens, dummies: loja.dummies,
                resumoTurnoMapa: loja.resumoTurnoMapa, cenario: loja.cenario, feedCombate: loja.feedCombate,
                divisorPoderMesa: loja.divisorPoderMesa,
                capitulosPresente, capitulosFuturo: podeVerFuturo ? capitulosFuturo : [],
            };
            const carregarArvore = async () => {
                try {
                    if (db && mesaId) { const snap = await get(ref(db, `mesas/${mesaId}/arvore`)); if (snap.exists()) return snap.val(); }
                } catch (e) { /* sem acesso ao banco: tenta a cópia local */ }
                try { return JSON.parse(localStorage.getItem('rpgSextaFeira_arvore') || 'null'); } catch (e) { return null; }
            };
            const systemInstruction = montarInstrucaoSistema({ contextoFicha: montarContextoInicial(estadoMesa), lore });

            let textoPedido = msgUsuario || 'Faça um resumo do arquivo anexado.';
            if (textoAnexo) textoPedido += `\n\n--- CONTEÚDO DO ARQUIVO ANEXADO (${nomeAnexo}) ---\n${textoAnexo}\n--- FIM DO ARQUIVO ---`;
            const contents = adicionarMensagemUsuario(montarHistoricoGemini(historicoAnterior), textoPedido);

            const resposta = await chamarGemini({
                chave: sextaFeiraConfig.chaveGemini,
                modelo: sextaFeiraConfig.modelo || MODELO_GEMINI_PADRAO,
                systemInstruction,
                contents,
                ferramentas: {
                    declaracoes: DECLARACOES_FERRAMENTAS,
                    executar: (nome, args) => executarFerramenta(nome, args, estadoMesa, { carregarArvore }),
                },
            });
            setHistorico(prev => [...prev, { role: 'ai', texto: resposta }]);
        } catch (err) {
            console.error('[Sexta-Feira]', err);
            setHistorico(prev => [...prev, { role: 'erro', texto: err?.message || 'Erro ao contactar a IA.' }]);
        }
        finally { setCarregando(false); }
    }, [mensagem, arquivoTexto, nomeArquivo, carregando, iaConfigurada, isMestre, historico, podeVerFuturo, capitulosPresente, capitulosFuturo, loreFoco, arcoAtivoObj, meuNome, mesaId, sextaFeiraConfig]);

    // ⚙️ Config da Sexta-Feira na mesa (só Mestre/Co-Mestre). Lida por hooks/useSextaFeiraMesa.js.
    const salvarConfigSextaFeira = useCallback(async ({ chaveGemini, modelo }) => {
        if (!isMestre || !mesaId || !db) return false;
        const chave = String(chaveGemini || '').trim();
        const novaConfig = chave
            ? { chaveGemini: chave, modelo: String(modelo || '').trim() || MODELO_GEMINI_PADRAO, atualizadoEm: Date.now() }
            : null;
        await set(ref(db, `mesas/${mesaId}/sextaFeira/config`), novaConfig);
        // Status "online" na hora, sem depender da escuta (ex.: escuta recusada antes de as regras mudarem).
        useStore.getState().setSextaFeiraConfig(novaConfig);
        return true;
    }, [isMestre, mesaId]);

    const handleKeyDown = useCallback((e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } }, [enviarMensagem]);

    const value = useMemo(() => ({
        minhaFicha, meuNome, personagens, subAba, setSubAba, mensagem, setMensagem,
        historico, setHistorico, carregando, setCarregando, chatRef, loreFoco, setLoreFoco,
        novoPersonagem, setNovoPersonagem, novoAvatar, setNovoAvatar,
        capitulosPresente, setCapitulosPresente, capituloAtivoId, setCapituloAtivoId,
        arcoAtivoIdPresente, setArcoAtivoIdPresente,
        capitulosFuturo, setCapitulosFuturo, capFuturoAtivoId, setCapFuturoAtivoId,
        arcoAtivoIdFuturo, setArcoAtivoIdFuturo,
        capituloAtivoObj, arcoAtivoObj, textoAtivo, tierListAtiva, poolPersonagens,
        moverPersonagem, handleDragStart, handleDragOver, handleDrop, adicionarCustomizado,
        adicionarCapitulo, editarTituloCapitulo, apagarCapitulo,
        adicionarArco, editarTituloArco, apagarArco, 
        atualizarTexto, salvarNoRegistro, 
        montarContextoFicha, enviarMensagem, handleKeyDown,
        arquivoTexto, nomeArquivo, setArquivoTexto, setNomeArquivo,
        fileInputRef, handleArquivoSelecionado, limparChat,
        isMestre, podeEditarRegistros, podeVerFuturo, registrosCompartilhados,
        sextaFeiraConfig, iaConfigurada, salvarConfigSextaFeira
    }), [
        minhaFicha, meuNome, personagens, subAba, mensagem, historico, carregando,
        loreFoco, novoPersonagem, novoAvatar, capitulosPresente, capituloAtivoId, arcoAtivoIdPresente,
        capitulosFuturo, capFuturoAtivoId, arcoAtivoIdFuturo, capituloAtivoObj, arcoAtivoObj, textoAtivo, tierListAtiva, poolPersonagens,
        moverPersonagem, handleDragStart, handleDragOver, handleDrop, adicionarCustomizado,
        adicionarCapitulo, editarTituloCapitulo, apagarCapitulo, adicionarArco, editarTituloArco, apagarArco,
        atualizarTexto, salvarNoRegistro,
        montarContextoFicha, enviarMensagem, handleKeyDown,
        arquivoTexto, nomeArquivo, handleArquivoSelecionado, limparChat,
        isMestre, podeEditarRegistros, podeVerFuturo, registrosCompartilhados,
        sextaFeiraConfig, iaConfigurada, salvarConfigSextaFeira
    ]);

    return (
        <AIFormContext.Provider value={value}>
            {children}
        </AIFormContext.Provider>
    );
}