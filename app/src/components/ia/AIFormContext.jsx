import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ref, set, get } from 'firebase/database';
import { db } from '../../services/firebase-config';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { salvarFichaSilencioso, salvarDummie } from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';
import {
    MODELO_GEMINI_PADRAO, montarHistoricoGemini,
    adicionarMensagemUsuario, selecionarLoreRelevante, montarInstrucaoSistema,
    listarAlvosMencao, descreverMencoes, normalizarCapitulos,
} from '../../core/sextaFeira';
import { markdownParaTextoFalado } from '../../core/markdownSexta';
import { useDialogosSexta } from './DialogosSexta';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { DECLARACOES_FERRAMENTAS, executarFerramenta, montarContextoInicial } from '../../core/sextaFeiraFerramentas';
import { DECLARACOES_CRIACAO, CAMPO_FICHA_POR_TIPO, anexarNaLista, normalizarProposta } from '../../core/sextaFeiraCriacao';
import {
    montarLinhasSessao, listarDestinosRegistros, montarPedidoResumo, extrairDestinoSugerido, montarTextoMemoria,
} from '../../core/sextaFeiraSessao';
import {
    carregarEventosFeedDesde, carregarTranscricoesDesde, memorizarFato, apagarFato,
    lerUltimoResumoEm, gravarUltimoResumoEm, carregarChat, salvarChat, LIMITE_MENSAGENS_CHAT_SALVAS,
    chaveVersaoArco, salvarVersaoArco, listarVersoesArco, guardarNaLixeira, listarLixeira, removerDaLixeira,
    anexarNaFicha, enviarPendente, registrarDecisao, reivindicarPendente,
} from '../../services/sextaFeiraDados';
import * as pdfjsLib from 'pdfjs-dist';

// Períodos do "Resumir sessão" (valor -> rótulo). 'ultimo' = desde o último resumo feito.
export const PERIODOS_RESUMO = { hoje: 'de hoje', '6h': 'das últimas 6 horas', ultimo: 'desde o último resumo' };

// Depois de tanto tempo sem mexer num arco, a próxima edição guarda o texto anterior como versão.
const INTERVALO_VERSAO_EDICAO_MS = 10 * 60 * 1000;

function inicioDoDia() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

// 🎚️ Preferências do chat guardadas neste navegador (fontes que a Sexta-Feira usa + voz).
const CHAVE_PREFERENCIAS_CHAT = 'rpgSextaFeira_preferencias';
export const PREFERENCIAS_CHAT_PADRAO = { lore: true, mesa: true, memoria: true, voz: false };
function lerPreferenciasChat() {
    try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS_CHAT) || 'null');
        return { ...PREFERENCIAS_CHAT_PADRAO, ...(salvo && typeof salvo === 'object' ? salvo : {}) };
    } catch (e) { return { ...PREFERENCIAS_CHAT_PADRAO }; }
}
function salvarPreferenciasChat(pref) {
    try { localStorage.setItem(CHAVE_PREFERENCIAS_CHAT, JSON.stringify(pref)); } catch (e) { /* sem localStorage */ }
}

// 🔊 Leitura em voz alta (Web Speech API do navegador, sem custo). Sem suporte, não faz nada.
function pararVoz() {
    try { if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* sem voz */ }
}
function falarTexto(texto) {
    try {
        if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
        const falado = markdownParaTextoFalado(texto);
        if (!falado) return;
        window.speechSynthesis.cancel();
        const fala = new window.SpeechSynthesisUtterance(falado);
        fala.lang = 'pt-BR';
        window.speechSynthesis.speak(fala);
    } catch (e) { /* sem voz */ }
}

// Cópia local da conversa, separada por mesa (a de uma mesa nunca aparece na outra).
function chaveChatLocal(mesaId, nome) { return `rpgSextaFeira_chat_${mesaId || 'semMesa'}_${nome}`; }

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
    const sextaFeiraMemoria = useStore(s => s.sextaFeiraMemoria);
    const sextaFeiraPendentes = useStore(s => s.sextaFeiraPendentes);
    const updateFicha = useStore(s => s.updateFicha);
    // 🪟 Modais no tema (components/ia/DialogosSexta.jsx); sem o provider, janelas do navegador.
    const dialogos = useDialogosSexta();

    // 🔒 Registros da mesa (hooks/useSextaFeiraMesa.js): só Mestre/Co-Mestre editam, e o Futuro
    // ("Ecos do Futuro") é só deles. Sem Registros na mesa, cada um edita os seus, como antes.
    const podeEditarRegistros = isMestre || !registrosCompartilhados;
    const podeVerFuturo = isMestre || !registrosCompartilhados;
    const iaConfigurada = !!(sextaFeiraConfig && sextaFeiraConfig.chaveGemini);

    const [subAba, setSubAba] = useState('chat');
    const [mensagem, setMensagem] = useState('');
    const [historico, setHistorico] = useState([]);
    const [carregando, setCarregando] = useState(false);
    // 🔇 Sair da aba/app não deixa a Sexta-Feira falando sozinha.
    useEffect(() => () => pararVoz(), []);

    // Texto da resposta enquanto ela ainda está sendo escrita (streaming); null quando parada.
    const [respostaParcial, setRespostaParcial] = useState(null);
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

    // 💾 CONVERSA: cópia local por mesa + jogador (localStorage) e cópia na mesa
    // (mesas/{mesaId}/sextaFeira/chats/{nome}), que aparece em qualquer aparelho.
    //  - Ao abrir (ou trocar de mesa/personagem): mostra a cópia local na hora e busca a da mesa.
    //    Se ninguém mexeu na conversa enquanto isso, a da mesa (quando existe) vence.
    //  - Se a pessoa mandou mensagens enquanto carregava, elas são somadas à da mesa; se limpou a
    //    conversa, a limpeza vale (e apaga a da mesa).
    //  - Só depois dessa primeira leitura as mudanças são gravadas na mesa (debounce), e nunca
    //    se forem iguais ao que já está lá.
    const historicoRef = useRef(historico);
    historicoRef.current = historico;
    const chatCarregadoRef = useRef(null);
    const ultimoChatSalvoRef = useRef(null);
    // Conversa local recém-lida que ainda não chegou à tela: até ela chegar, o histórico em
    // memória é o da mesa/personagem anterior e não pode ser gravado na chave nova.
    const aguardandoLocalRef = useRef(null);
    useEffect(() => {
        chatCarregadoRef.current = null;
        ultimoChatSalvoRef.current = null;
        if (!meuNome) return undefined;
        let local = [];
        try {
            let salvo = localStorage.getItem(chaveChatLocal(mesaId, meuNome));
            if (salvo === null) {
                // Migração, uma vez só: a conversa antiga (sem mesa) vai pra esta mesa e a chave
                // antiga é apagada, pra não reaparecer nas outras mesas.
                const chaveAntiga = `rpgSextaFeira_chat_${meuNome}`;
                salvo = localStorage.getItem(chaveAntiga);
                if (salvo !== null && mesaId) { localStorage.setItem(chaveChatLocal(mesaId, meuNome), salvo); localStorage.removeItem(chaveAntiga); }
            }
            const lido = salvo ? JSON.parse(salvo) : [];
            local = Array.isArray(lido) ? lido : [];
        } catch (e) { local = []; }
        aguardandoLocalRef.current = local;
        setHistorico(local);
        if (!mesaId) return undefined;
        let cancelado = false;
        carregarChat(mesaId, meuNome).then((remoto) => {
            if (cancelado) return;
            const temRemoto = Array.isArray(remoto) && remoto.length > 0;
            const atual = historicoRef.current;
            const mexeu = atual !== local;
            let final;
            if (!mexeu) final = temRemoto ? remoto : local;
            else if (local.every((m, i) => atual[i] === m)) final = [...(temRemoto ? remoto : local), ...atual.slice(local.length)];
            else final = atual; // limpou (ou trocou) a conversa enquanto carregava: vale o que está na tela
            ultimoChatSalvoRef.current = temRemoto ? JSON.stringify(remoto.slice(-LIMITE_MENSAGENS_CHAT_SALVAS)) : null;
            chatCarregadoRef.current = `${mesaId}|${meuNome}`;
            if (final !== atual) setHistorico(final);
            if (mexeu) {
                ultimoChatSalvoRef.current = JSON.stringify(final.slice(-LIMITE_MENSAGENS_CHAT_SALVAS));
                Promise.resolve(salvarChat(mesaId, meuNome, final)).catch(() => { ultimoChatSalvoRef.current = null; });
            }
        }).catch(() => { /* sem acesso ao banco: a conversa fica só neste navegador */ });
        return () => { cancelado = true; };
    }, [mesaId, meuNome]);
    useEffect(() => {
        if (!meuNome) return undefined;
        if (aguardandoLocalRef.current) {
            if (historico !== aguardandoLocalRef.current) return undefined;
            aguardandoLocalRef.current = null;
        }
        try { localStorage.setItem(chaveChatLocal(mesaId, meuNome), JSON.stringify(historico)); } catch (e) { /* sem localStorage */ }
        if (!mesaId || chatCarregadoRef.current !== `${mesaId}|${meuNome}`) return undefined;
        const json = JSON.stringify(historico.slice(-LIMITE_MENSAGENS_CHAT_SALVAS));
        if (json === ultimoChatSalvoRef.current) return undefined;
        const timer = setTimeout(() => {
            ultimoChatSalvoRef.current = json;
            Promise.resolve(salvarChat(mesaId, meuNome, historico)).catch(() => { ultimoChatSalvoRef.current = null; });
        }, 1500);
        return () => clearTimeout(timer);
    }, [historico, mesaId, meuNome]);

    useEffect(() => {
        localStorage.setItem('rpgSextaFeira_capitulos', JSON.stringify(capitulosPresente));
        localStorage.setItem('rpgSextaFeira_capituloAtivo', capituloAtivoId);
        localStorage.setItem('rpgSextaFeira_arcoAtivoPresente', arcoAtivoIdPresente);
        localStorage.setItem('rpgSextaFeira_capitulosFuturo', JSON.stringify(capitulosFuturo));
        localStorage.setItem('rpgSextaFeira_capFuturoAtivo', capFuturoAtivoId);
        localStorage.setItem('rpgSextaFeira_arcoAtivoFuturo', arcoAtivoIdFuturo);
    }, [capitulosPresente, capituloAtivoId, arcoAtivoIdPresente, capitulosFuturo, capFuturoAtivoId, arcoAtivoIdFuturo]);

    const limparChat = useCallback(async () => {
        const ok = await dialogos.confirmar({
            titulo: '🗑️ Limpar Memória da conversa',
            mensagem: 'A Sexta-Feira vai esquecer tudo o que vocês conversaram aqui (a memória da mesa continua).',
            textoConfirmar: 'Limpar', perigo: true,
        });
        if (ok) {
            setHistorico([]);
            try { localStorage.removeItem(chaveChatLocal(mesaId, meuNome)); localStorage.removeItem(`rpgSextaFeira_chat_${meuNome}`); } catch (e) { /* sem localStorage */ }
        }
    }, [meuNome, mesaId, dialogos]);

    // 📌 Memória permanente da mesa (só Mestre grava/apaga).
    const memorizarTexto = useCallback(async (texto, soMestre = false) => {
        if (!isMestre || !mesaId) return false;
        await memorizarFato(mesaId, { texto, soMestre, autor: meuNome });
        return true;
    }, [isMestre, mesaId, meuNome]);
    const esquecerFato = useCallback(async (id) => {
        if (!isMestre || !mesaId) return false;
        await apagarFato(mesaId, id);
        return true;
    }, [isMestre, mesaId]);

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

    // 🕘 VERSÕES E LIXEIRA (só com Registros da mesa e só Mestre/Co-Mestre, que são quem edita):
    // antes de mudanças grandes o texto anterior do arco vira uma versão restaurável, e capítulos/
    // arcos apagados vão pra Lixeira (services/sextaFeiraDados.js).
    const historicoDisponivel = registrosCompartilhados && isMestre && !!mesaId;
    // Quando cada arco ganhou a última versão (memória + localStorage, pra recarregar a página não
    // gerar uma versão nova a cada vez). Durante uma edição longa, uma versão a cada intervalo.
    const versaoEmRef = useRef({});
    const ultimaVersaoEm = useCallback((chave) => {
        if (versaoEmRef.current[chave] !== undefined) return versaoEmRef.current[chave];
        try { return Number(localStorage.getItem(`rpgSextaFeira_versaoEm_${mesaId}_${chave}`)) || 0; } catch (e) { return 0; }
    }, [mesaId]);
    const marcarVersaoEm = useCallback((chave, ms) => {
        versaoEmRef.current[chave] = ms;
        try { localStorage.setItem(`rpgSextaFeira_versaoEm_${mesaId}_${chave}`, String(ms)); } catch (e) { /* sem localStorage */ }
    }, [mesaId]);
    const guardarVersao = useCallback((foco, capId, arcId, texto, titulo, motivo) => {
        if (!historicoDisponivel || typeof texto !== 'string' || !texto.trim()) return;
        const chave = chaveVersaoArco(foco, capId, arcId);
        const anterior = ultimaVersaoEm(chave);
        marcarVersaoEm(chave, Date.now());
        Promise.resolve(salvarVersaoArco(mesaId, chave, { texto, titulo, autor: meuNome, motivo }))
            .catch((err) => {
                // Falhou: a próxima edição tenta de novo.
                marcarVersaoEm(chave, anterior);
                console.error('[Sexta-Feira] Falha ao guardar versão do arco:', err);
            });
    }, [historicoDisponivel, mesaId, meuNome, ultimaVersaoEm, marcarVersaoEm]);
    // Espera a cópia chegar na Lixeira antes de apagar. Se falhar, pergunta se apaga mesmo assim
    // (sem cópia). Retorna true quando pode seguir com a exclusão.
    const mandarParaLixeira = useCallback(async (item) => {
        if (!historicoDisponivel) return true;
        try {
            await guardarNaLixeira(mesaId, { ...item, autor: meuNome });
            return true;
        } catch (err) {
            console.error('[Sexta-Feira] Falha ao mandar para a Lixeira:', err);
            return dialogos.confirmar({
                titulo: '⚠️ Lixeira indisponível',
                mensagem: 'Não consegui guardar uma cópia na Lixeira. Apagar mesmo assim, SEM poder restaurar depois?',
                textoConfirmar: 'Apagar sem cópia', perigo: true,
            });
        }
    }, [historicoDisponivel, mesaId, meuNome, dialogos]);

    const adicionarCapitulo = useCallback(async () => {
        if (!podeEditarRegistros) return;
        const valores = await dialogos.pedirTextos({
            titulo: `📖 Novo Capítulo (${loreFoco === 'presente' ? 'Presente' : 'Futuro'})`,
            campos: [{ rotulo: 'Nome do Capítulo' }, { rotulo: 'Nome do primeiro Arco', valorInicial: 'Arco 1' }],
        });
        if (!valores) return;
        const [tituloCap, tituloArco] = valores.map(v => String(v || '').trim());
        if (!tituloCap || !tituloArco) return;

        const novoCapId = Date.now();
        const novoArcoId = Date.now() + 1;
        const novoCap = { id: novoCapId, titulo: tituloCap, tierList: [], arcos: [{ id: novoArcoId, titulo: tituloArco, texto: '' }] };

        if (loreFoco === 'presente') { setCapitulosPresente(prev => [...prev, novoCap]); setCapituloAtivoId(novoCapId); setArcoAtivoIdPresente(novoArcoId); }
        else { setCapitulosFuturo(prev => [...prev, novoCap]); setCapFuturoAtivoId(novoCapId); setArcoAtivoIdFuturo(novoArcoId); }
    }, [loreFoco, podeEditarRegistros, dialogos]);

    const editarTituloCapitulo = useCallback(async () => {
        if (!podeEditarRegistros) return;
        const novoTitulo = await dialogos.pedirTexto({ titulo: '✏️ Renomear Capítulo', rotulo: 'Nome do Capítulo', valorInicial: capituloAtivoObj?.titulo });
        if (!novoTitulo || novoTitulo.trim() === '') return;
        const idAtivo = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        if (loreFoco === 'presente') setCapitulosPresente(prev => prev.map(cap => cap.id === idAtivo ? { ...cap, titulo: novoTitulo } : cap));
        else setCapitulosFuturo(prev => prev.map(cap => cap.id === idAtivo ? { ...cap, titulo: novoTitulo } : cap));
    }, [loreFoco, capituloAtivoObj, capituloAtivoId, capFuturoAtivoId, podeEditarRegistros, dialogos]);

    const apagarCapitulo = useCallback(async () => {
        if (!podeEditarRegistros) return;
        const lista = loreFoco === 'presente' ? capitulosPresente : capitulosFuturo;
        if (lista.length <= 1) { dialogos.avisar('Não dá para apagar o único Capítulo existente.', 'erro'); return; }
        const idAtivo = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        const capitulo = lista.find(cap => cap.id === idAtivo);
        const ok = await dialogos.confirmar({
            titulo: '🗑️ Apagar Capítulo',
            mensagem: `Apagar o Capítulo "${capitulo?.titulo || ''}" INTEIRO, com todos os seus Arcos?${historicoDisponivel ? ' Ele fica na ♻️ Lixeira e pode ser restaurado.' : ''}`,
            textoConfirmar: 'Apagar', perigo: true,
        });
        if (!ok) return;
        if (capitulo && !(await mandarParaLixeira({ tipo: 'capitulo', foco: loreFoco, capituloId: capitulo.id, dados: capitulo }))) return;
        // Lê a lista de novo: enquanto o modal/Lixeira esperavam, os Registros podem ter mudado.
        const loja = useStore.getState();
        if (loreFoco === 'presente') {
            const nova = loja.loreCapitulosPresente.filter(cap => cap.id !== idAtivo);
            if (nova.length === 0) return;
            setCapitulosPresente(nova); setCapituloAtivoId(nova[0].id); setArcoAtivoIdPresente(nova[0].arcos[0].id);
        } else {
            const nova = loja.loreCapitulosFuturo.filter(cap => cap.id !== idAtivo);
            if (nova.length === 0) return;
            setCapitulosFuturo(nova); setCapFuturoAtivoId(nova[0].id); setArcoAtivoIdFuturo(nova[0].arcos[0].id);
        }
    }, [loreFoco, capitulosPresente, capitulosFuturo, capituloAtivoId, capFuturoAtivoId, podeEditarRegistros, dialogos, historicoDisponivel, mandarParaLixeira]);

    const adicionarArco = useCallback(async () => {
        if (!podeEditarRegistros) return;
        const titulo = await dialogos.pedirTexto({ titulo: '📂 Novo Arco', rotulo: 'Nome do Arco' });
        if (!titulo || titulo.trim() === '') return;
        const novoId = Date.now();
        const idAtivo = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;

        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        setCaps(prev => prev.map(c => {
            if (c.id === idAtivo) return { ...c, arcos: [...c.arcos, { id: novoId, titulo, texto: '' }] };
            return c;
        }));
        if (loreFoco === 'presente') setArcoAtivoIdPresente(novoId); else setArcoAtivoIdFuturo(novoId);
    }, [loreFoco, capituloAtivoId, capFuturoAtivoId, podeEditarRegistros, dialogos]);

    const editarTituloArco = useCallback(async () => {
        if (!podeEditarRegistros) return;
        const novoTitulo = await dialogos.pedirTexto({ titulo: '✏️ Renomear Arco', rotulo: 'Nome do Arco', valorInicial: arcoAtivoObj?.titulo });
        if (!novoTitulo || novoTitulo.trim() === '') return;
        const capId = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        const arcId = loreFoco === 'presente' ? arcoAtivoIdPresente : arcoAtivoIdFuturo;
        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;

        setCaps(prev => prev.map(c => {
            if (c.id === capId) return { ...c, arcos: c.arcos.map(a => a.id === arcId ? { ...a, titulo: novoTitulo } : a) };
            return c;
        }));
    }, [loreFoco, arcoAtivoObj, capituloAtivoId, capFuturoAtivoId, arcoAtivoIdPresente, arcoAtivoIdFuturo, podeEditarRegistros, dialogos]);

    const apagarArco = useCallback(async () => {
        if (!podeEditarRegistros) return;
        if (capituloAtivoObj?.arcos.length <= 1) { dialogos.avisar('Um Capítulo precisa ter pelo menos um Arco.', 'erro'); return; }
        const ok = await dialogos.confirmar({
            titulo: '🗑️ Apagar Arco',
            mensagem: `Apagar o Arco "${arcoAtivoObj?.titulo || ''}"?${historicoDisponivel ? ' Ele fica na ♻️ Lixeira e pode ser restaurado.' : ''}`,
            textoConfirmar: 'Apagar', perigo: true,
        });
        if (!ok) return;
        const capId = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        const arcId = loreFoco === 'presente' ? arcoAtivoIdPresente : arcoAtivoIdFuturo;
        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        const arco = capituloAtivoObj?.arcos.find(a => a.id === arcId);
        if (arco && !(await mandarParaLixeira({ tipo: 'arco', foco: loreFoco, capituloId: capId, dados: arco }))) return;

        // Relê a lista (os Registros podem ter mudado durante as esperas) e nunca deixa o capítulo sem arco.
        const listaAgora = loreFoco === 'presente' ? useStore.getState().loreCapitulosPresente : useStore.getState().loreCapitulosFuturo;
        const novosArcos = (listaAgora.find(c => c.id === capId)?.arcos || []).filter(a => a.id !== arcId);
        if (novosArcos.length === 0) return;
        setCaps(prev => prev.map(c => (c.id === capId ? { ...c, arcos: c.arcos.filter(a => a.id !== arcId) } : c)));
        if (loreFoco === 'presente') setArcoAtivoIdPresente(novosArcos[0].id); else setArcoAtivoIdFuturo(novosArcos[0].id);
    }, [loreFoco, capituloAtivoObj, arcoAtivoObj, capituloAtivoId, capFuturoAtivoId, arcoAtivoIdPresente, arcoAtivoIdFuturo, podeEditarRegistros, dialogos, historicoDisponivel, mandarParaLixeira]);

    const atualizarTexto = useCallback((novoTexto) => {
        if (!podeEditarRegistros) return;
        const capId = loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId;
        const arcId = loreFoco === 'presente' ? arcoAtivoIdPresente : arcoAtivoIdFuturo;
        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        // Guarda o texto de antes como versão, no máximo uma vez a cada INTERVALO_VERSAO_EDICAO_MS por arco.
        if (historicoDisponivel && arcoAtivoObj?.texto !== novoTexto
            && Date.now() - ultimaVersaoEm(chaveVersaoArco(loreFoco, capId, arcId)) > INTERVALO_VERSAO_EDICAO_MS) {
            guardarVersao(loreFoco, capId, arcId, arcoAtivoObj?.texto || '', arcoAtivoObj?.titulo, 'antes de uma edição');
        }
        setCaps(prev => prev.map(c => {
            if (c.id === capId) return { ...c, arcos: c.arcos.map(a => a.id === arcId ? { ...a, texto: novoTexto } : a) };
            return c;
        }));
    }, [loreFoco, capituloAtivoId, capFuturoAtivoId, arcoAtivoIdPresente, arcoAtivoIdFuturo, podeEditarRegistros, arcoAtivoObj, guardarVersao, historicoDisponivel, ultimaVersaoEm]);

    const salvarNoRegistro = useCallback(async (texto, tituloRegistro, destinoVal, foco = 'presente') => {
        if (!podeEditarRegistros) return false;
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        const separador = `\n\n================================\n[${tituloRegistro} - ${timestamp}]\n================================\n\n`;

        const setCaps = foco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        const setCapAtivo = foco === 'presente' ? setCapituloAtivoId : setCapFuturoAtivoId;
        const setArcAtivo = foco === 'presente' ? setArcoAtivoIdPresente : setArcoAtivoIdFuturo;

        if (destinoVal === 'novo_capitulo') {
            const valores = await dialogos.pedirTextos({
                titulo: '📖 Novo Capítulo para este texto',
                campos: [{ rotulo: 'Nome do Capítulo' }, { rotulo: 'Nome do primeiro Arco', valorInicial: 'Arco 1' }],
            });
            if (!valores) return false;
            const [nomeCap, nomeArco] = valores.map(v => String(v || '').trim());
            if (!nomeCap || !nomeArco) return false;
            const newCapId = Date.now();
            const newArcId = Date.now() + 1;
            setCaps(prev => [...prev, { id: newCapId, titulo: nomeCap, tierList: [], arcos: [{ id: newArcId, titulo: nomeArco, texto: texto }] }]);
            setCapAtivo(newCapId); setArcAtivo(newArcId); setLoreFoco(foco);
        } else if (destinoVal.startsWith('novo_arco_')) {
            const capId = Number(destinoVal.replace('novo_arco_', ''));
            const nomeArco = await dialogos.pedirTexto({ titulo: '📂 Novo Arco para este texto', rotulo: 'Nome do Arco' });
            if (!nomeArco || !nomeArco.trim()) return false;
            const newArcId = Date.now();
            setCaps(prev => prev.map(c => {
                if (c.id === capId) return { ...c, arcos: [...c.arcos, { id: newArcId, titulo: nomeArco, texto: texto }] };
                return c;
            }));
            setCapAtivo(capId); setArcAtivo(newArcId); setLoreFoco(foco);
        } else {
            const [capIdStr, arcIdStr] = destinoVal.split('_');
            const capId = Number(capIdStr); const arcId = Number(arcIdStr);
            const listaAtual = foco === 'presente' ? capitulosPresente : capitulosFuturo;
            const arcoAntes = listaAtual.find(c => c.id === capId)?.arcos.find(a => a.id === arcId);
            if (arcoAntes) guardarVersao(foco, capId, arcId, arcoAntes.texto, arcoAntes.titulo, `antes de acrescentar: ${tituloRegistro}`);
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
    }, [podeEditarRegistros, setCapitulosPresente, setCapituloAtivoId, setArcoAtivoIdPresente, setCapitulosFuturo, setCapFuturoAtivoId, setArcoAtivoIdFuturo, setLoreFoco, dialogos, capitulosPresente, capitulosFuturo, guardarVersao]);

    // 🕘 Versões do arco aberto (mais nova primeiro) e restauração (o texto atual vira versão antes).
    // Depende só dos ids: sincronizar o texto do arco não recarrega a lista aberta na janela.
    const capituloAtivoIdAtual = capituloAtivoObj?.id;
    const arcoAtivoIdAtual = arcoAtivoObj?.id;
    const listarVersoesDoArcoAtivo = useCallback(async () => {
        if (!historicoDisponivel || capituloAtivoIdAtual === undefined || arcoAtivoIdAtual === undefined) return [];
        return listarVersoesArco(mesaId, chaveVersaoArco(loreFoco, capituloAtivoIdAtual, arcoAtivoIdAtual));
    }, [historicoDisponivel, mesaId, loreFoco, capituloAtivoIdAtual, arcoAtivoIdAtual]);

    const restaurarVersao = useCallback((versao) => {
        if (!podeEditarRegistros || !capituloAtivoObj || !arcoAtivoObj || typeof versao?.texto !== 'string') return false;
        const capId = capituloAtivoObj.id; const arcId = arcoAtivoObj.id;
        guardarVersao(loreFoco, capId, arcId, arcoAtivoObj.texto, arcoAtivoObj.titulo, 'antes de restaurar uma versão');
        const setCaps = loreFoco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        setCaps(prev => prev.map(c => (c.id === capId ? { ...c, arcos: c.arcos.map(a => (a.id === arcId ? { ...a, texto: versao.texto } : a)) } : c)));
        return true;
    }, [podeEditarRegistros, capituloAtivoObj, arcoAtivoObj, loreFoco, guardarVersao, setCapitulosPresente, setCapitulosFuturo]);

    // ♻️ Lixeira: capítulo volta pro fim da lista certa; arco volta pro capítulo de origem (ou pro
    // capítulo aberto, se o de origem não existir mais). Ids repetidos ganham um id novo.
    const carregarLixeira = useCallback(async () => (historicoDisponivel ? listarLixeira(mesaId) : []), [historicoDisponivel, mesaId]);

    const restaurarDaLixeira = useCallback(async (item) => {
        if (!historicoDisponivel || !item?.dados) return false;
        const foco = item.foco === 'futuro' ? 'futuro' : 'presente';
        const setCaps = foco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
        const lista = foco === 'presente' ? capitulosPresente : capitulosFuturo;
        // Valida tudo ANTES de mexer na Lixeira; tira da Lixeira primeiro (se isso falhar, nada muda)
        // e só então devolve aos Registros — assim nunca some sem voltar, nem volta duas vezes.
        if (item.tipo === 'capitulo') {
            const [cap] = normalizarCapitulos([item.dados]);
            if (!cap) return false;
            await removerDaLixeira(mesaId, item.id);
            setCaps(prev => [...prev, prev.some(c => c.id === cap.id) ? { ...cap, id: Date.now() } : cap]);
        } else {
            const arco = { id: item.dados.id ?? Date.now(), titulo: item.dados.titulo || 'Arco restaurado', texto: typeof item.dados.texto === 'string' ? item.dados.texto : '' };
            const destinoId = lista.some(c => c.id === item.capituloId) ? item.capituloId : (capituloAtivoObj?.id ?? lista[0]?.id);
            if (destinoId === undefined || destinoId === null || !lista.some(c => c.id === destinoId)) return false;
            await removerDaLixeira(mesaId, item.id);
            setCaps(prev => {
                // Se o capítulo de destino sumiu nesse meio tempo, vai pro primeiro que existir.
                const alvo = prev.some(c => c.id === destinoId) ? destinoId : prev[0]?.id;
                return prev.map(c => {
                    if (c.id !== alvo) return c;
                    const arcoFinal = c.arcos.some(a => a.id === arco.id) ? { ...arco, id: Date.now() } : arco;
                    return { ...c, arcos: [...c.arcos, arcoFinal] };
                });
            });
        }
        return true;
    }, [historicoDisponivel, mesaId, capitulosPresente, capitulosFuturo, capituloAtivoObj, setCapitulosPresente, setCapitulosFuturo]);

    useEffect(() => { if (subAba === 'chat' && chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [historico, subAba, respostaParcial, carregando]);

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
            else { dialogos.avisar('Formato não suportado. Use PDF, TXT ou MD.', 'erro'); return; }
            
            const MAX_CHARS = 15000;
            if (texto.length > MAX_CHARS) texto = texto.substring(0, MAX_CHARS) + '\n...[TEXTO TRUNCADO]';
            setArquivoTexto(texto); setNomeArquivo(file.name);
        } catch (err) { dialogos.avisar('Erro ao ler o arquivo.', 'erro'); } 
        finally { e.target.value = ''; }
    }, [extrairTextoPDF, dialogos]);

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

    // 🎚️ PREFERÊNCIAS DO CHAT (de cada pessoa, neste navegador): quais fontes a Sexta-Feira usa e
    // se lê as respostas em voz alta.
    const [preferencias, setPreferencias] = useState(lerPreferenciasChat);
    const alternarPreferencia = useCallback((chave) => {
        setPreferencias((atual) => {
            const nova = { ...atual, [chave]: !atual[chave] };
            salvarPreferenciasChat(nova);
            if (chave === 'voz' && !nova.voz) pararVoz();
            return nova;
        });
    }, []);

    const ultimoPedidoRef = useRef(null);

    // Nomes/arcos que dá pra mencionar com @ no chat.
    const personagensStore = useStore(s => s.personagens);
    const dummiesStore = useStore(s => s.dummies);
    const alvosMencao = useMemo(() => listarAlvosMencao({
        meuNome, personagens: personagensStore, dummies: dummiesStore, capitulosPresente, capitulosFuturo, podeVerFuturo,
    }), [meuNome, personagensStore, dummiesStore, capitulosPresente, capitulosFuturo, podeVerFuturo]);

    // Monta o pedido (contexto, lore, memória, ferramentas) e fala com o Gemini. A mensagem do
    // usuário já deve estar no histórico; `historicoBase` é a conversa ANTES dela.
    const processarEnvio = useCallback(async ({ msgUsuario, textoAnexo, nomeAnexo, historicoBase }) => {
        setCarregando(true);
        try {
            // Jogadores não recebem trechos do Futuro (spoilers) quando os Registros são da mesa.
            const capitulosParaIA = podeVerFuturo ? [...capitulosPresente, ...capitulosFuturo] : capitulosPresente;
            const textoArcoParaIA = (loreFoco === 'futuro' && !podeVerFuturo) ? '' : (arcoAtivoObj?.texto || '');
            const lore = preferencias.lore ? selecionarLoreRelevante(capitulosParaIA, msgUsuario, textoArcoParaIA) : '';
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
            // Propostas de criação feitas nesta resposta (viram cartões na mensagem da Sexta-Feira).
            const propostasDoTurno = [];
            const opcoesFerramentas = {
                registrarProposta: async (p) => {
                    const id = `prop_${Date.now()}_${propostasDoTurno.length}`;
                    const extras = {};
                    // Tier List: fica presa ao capítulo aberto AGORA; NPC: à cena publicada agora.
                    if (p.tipo === 'tierlist') { extras.foco = loreFoco; extras.capituloId = capituloAtivoObj?.id; extras.capituloTitulo = capituloAtivoObj?.titulo || ''; }
                    if (p.tipo === 'npc') {
                        const cen = useStore.getState().cenario;
                        extras.cenaId = cen?.ativa || 'default';
                        extras.cenaNome = cen?.lista?.[extras.cenaId]?.nome || extras.cenaId;
                    }
                    propostasDoTurno.push({ id, ...p, ...extras, estado: 'nova' });
                    return id;
                },
                carregarArvore,
                carregarTranscricoes: (desde) => carregarTranscricoesDesde(mesaId, desde),
                memorizar: ({ texto, soMestre }) => memorizarFato(mesaId, { texto, soMestre, autor: meuNome }),
            };
            const memoria = preferencias.memoria ? montarTextoMemoria(loja.sextaFeiraMemoria, isMestre) : '';
            // Sem "Dados da mesa": nem a ficha, nem as ferramentas — só quem fala e o papel.
            const contextoFicha = preferencias.mesa
                ? montarContextoInicial(estadoMesa)
                : `Quem fala: ${meuNome || 'Desconhecido'}\nPapel: ${isMestre ? 'Mestre' : 'Jogador'}\n(Quem fala desligou o acesso aos dados da mesa nesta conversa.)`;
            const systemInstruction = montarInstrucaoSistema({ contextoFicha, lore, memoria, semFerramentas: !preferencias.mesa });
            // Fontes desligadas também tiram as ferramentas correspondentes.
            // Jogadores não recebem as ferramentas só-Mestre (NPC, Tier List, poder do grupo).
            const soMestre = ['propor_npc', 'propor_tier_list', 'poder_do_grupo'];
            const declaracoes = [...DECLARACOES_FERRAMENTAS, ...DECLARACOES_CRIACAO].filter(d => !(
                (!preferencias.lore && d.name === 'buscar_lore') || (!preferencias.memoria && d.name === 'memorizar_fato')
                || (!isMestre && soMestre.includes(d.name))
            ));

            let textoPedido = msgUsuario || 'Faça um resumo do arquivo anexado.';
            const dicaMencoes = descreverMencoes(msgUsuario, alvosMencao, { comFerramentas: preferencias.mesa });
            if (dicaMencoes) textoPedido += `\n\n(${dicaMencoes})`;
            if (textoAnexo) textoPedido += `\n\n--- CONTEÚDO DO ARQUIVO ANEXADO (${nomeAnexo}) ---\n${textoAnexo}\n--- FIM DO ARQUIVO ---`;
            const contents = adicionarMensagemUsuario(montarHistoricoGemini(historicoBase), textoPedido);

            const resposta = await chamarGemini({
                chave: sextaFeiraConfig.chaveGemini,
                modelo: sextaFeiraConfig.modelo || MODELO_GEMINI_PADRAO,
                systemInstruction,
                contents,
                ferramentas: preferencias.mesa ? {
                    declaracoes,
                    // Pedido de uma ferramenta de fonte desligada é recusado.
                    executar: (nome, args) => (declaracoes.some(d => d.name === nome) || !DECLARACOES_FERRAMENTAS.some(d => d.name === nome)
                        ? executarFerramenta(nome, args, estadoMesa, opcoesFerramentas)
                        : { erro: 'Essa fonte está desligada nesta conversa.' }),
                } : null,
                aoReceberTexto: (parcial) => setRespostaParcial(parcial),
            });
            setHistorico(prev => [...prev, { role: 'ai', texto: resposta, ...(propostasDoTurno.length ? { propostas: propostasDoTurno } : {}) }]);
            if (preferencias.voz) falarTexto(resposta);
        } catch (err) {
            console.error('[Sexta-Feira]', err);
            setHistorico(prev => [...prev, { role: 'erro', texto: err?.message || 'Erro ao contactar a IA.' }]);
        } finally {
            setRespostaParcial(null);
            setCarregando(false);
        }
    }, [podeVerFuturo, capitulosPresente, capitulosFuturo, loreFoco, arcoAtivoObj, preferencias, meuNome, isMestre, mesaId, alvosMencao, sextaFeiraConfig]);

    const avisarSemChave = useCallback(() => {
        setHistorico(prev => [...prev, { role: 'erro', texto: isMestre
            ? 'A Sexta-Feira ainda não tem uma chave do Gemini. Abra ⚙️ Config nesta aba e cadastre a chave.'
            : 'A Sexta-Feira ainda não foi configurada pelo Mestre desta mesa.' }]);
    }, [isMestre]);

    // Envia o que está digitado (com anexo), ou `textoDireto` (atalhos) sem mexer no campo.
    const enviarMensagem = useCallback(async (textoDireto) => {
        const direto = typeof textoDireto === 'string';
        const msgUsuario = (direto ? textoDireto : mensagem).trim();
        const textoAnexo = direto ? '' : arquivoTexto;
        const nomeAnexo = direto ? '' : nomeArquivo;
        if ((!msgUsuario && !textoAnexo) || carregando) return;
        if (!iaConfigurada) { avisarSemChave(); return; }

        if (!direto) { setMensagem(''); setArquivoTexto(''); setNomeArquivo(''); }

        const displayMsg = nomeAnexo ? `${msgUsuario || 'Analise o documento anexado.'}\n📄 [Arquivo: ${nomeAnexo}]` : msgUsuario;
        ultimoPedidoRef.current = { displayMsg, msgUsuario, textoAnexo, nomeAnexo };
        // Histórico ANTES desta mensagem: vai junto pro Gemini como memória da conversa.
        const historicoBase = historico;
        setHistorico(prev => [...prev, { role: 'user', texto: displayMsg }]);
        await processarEnvio({ msgUsuario, textoAnexo, nomeAnexo, historicoBase });
    }, [mensagem, arquivoTexto, nomeArquivo, carregando, iaConfigurada, avisarSemChave, historico, processarEnvio]);

    // 📝 RESUMO DE SESSÃO (só Mestre): junta o feed de combate e as falas transcritas do período,
    // pede à Sexta-Feira uma crônica e sugere onde guardar nos Registros (o Mestre confirma no
    // seletor "Destino" da própria resposta).
    const resumirSessao = useCallback(async (periodo = 'hoje') => {
        if (!isMestre || carregando) return;
        if (!iaConfigurada) {
            setHistorico(prev => [...prev, { role: 'erro', texto: 'A Sexta-Feira ainda não tem uma chave do Gemini. Abra ⚙️ Config nesta aba e cadastre a chave.' }]);
            return;
        }
        const rotulo = PERIODOS_RESUMO[periodo] || PERIODOS_RESUMO.hoje;
        setHistorico(prev => [...prev, { role: 'user', tipo: 'pedidoResumo', periodo, texto: `📝 Resumir a sessão ${rotulo}` }]);
        setCarregando(true);
        try {
            let desde = periodo === '6h' ? Date.now() - 6 * 3600000 : inicioDoDia();
            if (periodo === 'ultimo') desde = (await lerUltimoResumoEm(mesaId)) || inicioDoDia();
            const [eventosFeed, transcricoes] = await Promise.all([
                carregarEventosFeedDesde(mesaId, desde),
                carregarTranscricoesDesde(mesaId, desde),
            ]);
            const sessao = montarLinhasSessao({ eventosFeed, transcricoes });
            if (sessao.total === 0) {
                setHistorico(prev => [...prev, { role: 'erro', texto: 'Não há eventos de combate nem falas transcritas nesse período para resumir.' }]);
                return;
            }
            const destinos = listarDestinosRegistros(capitulosPresente);
            const desdeTexto = `desde ${new Date(desde).toLocaleString('pt-BR')}, ${sessao.total} registro(s)`;
            const resposta = await chamarGemini({
                chave: sextaFeiraConfig.chaveGemini,
                modelo: sextaFeiraConfig.modelo || MODELO_GEMINI_PADRAO,
                systemInstruction: montarInstrucaoSistema({ contextoFicha: `Quem pede: ${meuNome} (Mestre)`, lore: '', memoria: montarTextoMemoria(sextaFeiraMemoria, true) }),
                contents: [{ role: 'user', parts: [{ text: montarPedidoResumo({ linhasSessao: sessao.texto, destinos, desdeTexto }) }] }],
            });
            const { texto, destino } = extrairDestinoSugerido(resposta, destinos);
            setHistorico(prev => [...prev, { role: 'ai', tipo: 'resumo', texto, ...(destino ? { destinoSugerido: destino } : {}) }]);
            Promise.resolve(gravarUltimoResumoEm(mesaId, Date.now())).catch(() => {});
        } catch (err) {
            console.error('[Sexta-Feira] resumo de sessão', err);
            setHistorico(prev => [...prev, { role: 'erro', texto: err?.message || 'Não foi possível resumir a sessão.' }]);
        } finally {
            setCarregando(false);
        }
    }, [isMestre, carregando, iaConfigurada, mesaId, capitulosPresente, sextaFeiraConfig, meuNome, sextaFeiraMemoria]);

    // ↻ TENTAR DE NOVO: refaz o último pedido (depois de um erro), sem repetir a mensagem na conversa.
    const tentarDeNovo = useCallback(async () => {
        if (carregando) return;
        if (!iaConfigurada) { avisarSemChave(); return; }
        let idx = historico.length - 1;
        while (idx >= 0 && historico[idx].role !== 'user') idx--;
        if (idx < 0) return;
        const pedidoMsg = historico[idx];
        if (pedidoMsg.tipo === 'pedidoResumo') {
            // resumirSessao adiciona o próprio pedido de novo.
            setHistorico(historico.slice(0, idx));
            await resumirSessao(pedidoMsg.periodo);
            return;
        }
        const ultimo = ultimoPedidoRef.current;
        const pedido = ultimo && ultimo.displayMsg === pedidoMsg.texto
            ? ultimo
            : { msgUsuario: String(pedidoMsg.texto).replace(/\n📄 \[Arquivo: [^\]]*\]$/, ''), textoAnexo: '', nomeAnexo: '' };
        setHistorico(historico.slice(0, idx + 1));
        await processarEnvio({ ...pedido, historicoBase: historico.slice(0, idx) });
    }, [carregando, iaConfigurada, avisarSemChave, historico, resumirSessao, processarEnvio]);

    // 🛠️ CRIAÇÃO COM CONFIRMAÇÃO (core/sextaFeiraCriacao.js): as propostas ficam na própria resposta
    // (msg.propostas) com um estado: nova -> aplicada (Mestre) | enviada (jogador, aguarda o Mestre)
    // | descartada. O Mestre aprova/recusa os pedidos dos jogadores pela fila `sextaFeiraPendentes`.
    const atualizarProposta = useCallback((msgIdx, propostaId, patch) => {
        setHistorico(prev => prev.map((m, i) => (i !== msgIdx || !Array.isArray(m.propostas) ? m : {
            ...m, propostas: m.propostas.map(p => (p.id === propostaId ? { ...p, ...patch } : p)),
        })));
    }, []);

    // Grava de fato uma criação já validada (usado pelo Mestre, direto ou ao aprovar um pedido).
    const gravarCriacao = useCallback(async ({ tipo, objeto, alvo, quantidade, cenaId: cenaProposta, foco: focoProposta, capituloId: capituloProposta }) => {
        if (tipo === 'poder' || tipo === 'magia' || tipo === 'item') {
            const campo = CAMPO_FICHA_POR_TIPO[tipo];
            const novo = { ...objeto, id: Date.now() };
            if (sanitizarNome(alvo || '') === sanitizarNome(meuNome || '')) {
                updateFicha((f) => { f[campo] = anexarNaLista(f[campo], novo); });
                salvarFichaSilencioso();
            } else {
                await anexarNaFicha(mesaId, alvo, campo, novo);
            }
            return;
        }
        if (tipo === 'npc') {
            // Mesmo padrão do Mapa: sem Cena publicada, é a 'default'.
            const cenaId = cenaProposta || useStore.getState().cenario?.ativa || 'default';
            const qtd = Math.min(10, Math.max(1, Number(quantidade) || 1));
            for (let i = 0; i < qtd; i++) {
                const nome = qtd > 1 ? `${objeto.nome} ${i + 1}` : objeto.nome;
                salvarDummie(`dummie_${Date.now()}_${i}`, { ...objeto, nome, cenaId, posicao: { x: i, y: 0 } });
            }
            return;
        }
        if (tipo === 'tierlist') {
            const foco = focoProposta || loreFoco;
            const setCaps = foco === 'presente' ? setCapitulosPresente : setCapitulosFuturo;
            const capId = capituloProposta ?? (foco === 'presente' ? capituloAtivoId : capFuturoAtivoId);
            const listaCaps = foco === 'presente' ? useStore.getState().loreCapitulosPresente : useStore.getState().loreCapitulosFuturo;
            if (!listaCaps.some(c => c.id === capId)) throw new Error('O capítulo desta Tier List não existe mais.');
            const avatarDe = (nome) => poolPersonagens.find(p => p.nome === nome)?.avatar || '';
            setCaps(prev => prev.map((c) => {
                if (c.id !== capId) return c;
                let tier = Array.isArray(c.tierList) ? [...c.tierList] : [];
                (objeto.ranks || []).forEach(({ nome, rank }) => {
                    const existente = tier.find(t => t.nome === nome);
                    tier = tier.filter(t => t.nome !== nome);
                    tier.push({ ...(existente || {}), nome, avatar: existente?.avatar || avatarDe(nome), rank });
                });
                return { ...c, tierList: tier };
            }));
            return;
        }
        throw new Error('Tipo de criação desconhecido.');
    }, [meuNome, mesaId, updateFicha, loreFoco, capituloAtivoId, capFuturoAtivoId, poolPersonagens]);

    // Propostas sendo aplicadas agora: impede gravar duas vezes (duplo clique / chamadas paralelas),
    // já que o estado 'aplicada' só chega ao histórico depois da gravação.
    const aplicandoRef = useRef(new Set());
    const aplicarProposta = useCallback(async (msgIdx, propostaId) => {
        const proposta = historico[msgIdx]?.propostas?.find(p => p.id === propostaId);
        if (!isMestre || !proposta || proposta.estado !== 'nova' || aplicandoRef.current.has(propostaId)) return false;
        aplicandoRef.current.add(propostaId);
        try {
            await gravarCriacao(proposta);
            atualizarProposta(msgIdx, propostaId, { estado: 'aplicada' });
            dialogos.avisar(`✅ ${proposta.objeto?.nome || 'Tier List'} aplicado${proposta.alvo ? ` em ${proposta.alvo}` : ''}.`);
            return true;
        } catch (err) {
            dialogos.avisar(`Não foi possível aplicar: ${err?.message || 'erro desconhecido'}.`, 'erro');
            return false;
        } finally {
            aplicandoRef.current.delete(propostaId);
        }
    }, [isMestre, historico, gravarCriacao, atualizarProposta, dialogos]);

    const enviarPropostaParaAprovacao = useCallback(async (msgIdx, propostaId) => {
        const proposta = historico[msgIdx]?.propostas?.find(p => p.id === propostaId);
        if (!proposta || proposta.estado !== 'nova' || !mesaId) return false;
        if (!['poder', 'magia', 'item'].includes(proposta.tipo)) return false;
        try {
            await enviarPendente(mesaId, { tipo: proposta.tipo, alvo: proposta.alvo, objeto: proposta.objeto, avisos: proposta.avisos, solicitante: meuNome });
            atualizarProposta(msgIdx, propostaId, { estado: 'enviada' });
            dialogos.avisar('📨 Enviado para o Mestre aprovar.');
            return true;
        } catch (err) {
            dialogos.avisar(`Não foi possível enviar: ${err?.message || 'erro desconhecido'}.`, 'erro');
            return false;
        }
    }, [historico, mesaId, meuNome, atualizarProposta, dialogos]);

    const descartarProposta = useCallback((msgIdx, propostaId) => {
        atualizarProposta(msgIdx, propostaId, { estado: 'descartada' });
    }, [atualizarProposta]);

    // Pedidos de jogadores: tudo é validado DE NOVO antes de gravar (o pedido veio do banco e
    // qualquer um da mesa consegue escrever lá): o tipo, o objeto, e que o pedido é para a própria
    // ficha de quem pediu, que precisa existir na mesa.
    const validarPedido = useCallback((pedido) => {
        if (!pedido || !['poder', 'magia', 'item'].includes(pedido.tipo)) return { erro: 'Tipo de pedido inválido.' };
        const { objeto, valido } = normalizarProposta(pedido.tipo, pedido.objeto);
        if (!valido) return { erro: 'O conteúdo do pedido é inválido.' };
        const alvo = String(pedido.alvo || '');
        if (!alvo || sanitizarNome(alvo) !== sanitizarNome(pedido.solicitante || '')) return { erro: 'O pedido não é para a ficha de quem pediu.' };
        const loja = useStore.getState();
        const existe = sanitizarNome(alvo) === sanitizarNome(loja.meuNome || '')
            || Object.keys(loja.personagens || {}).some(n => sanitizarNome(n) === sanitizarNome(alvo));
        if (!existe) return { erro: `O personagem "${alvo}" não existe nesta mesa.` };
        return { objeto, alvo };
    }, []);

    const aprovarPendente = useCallback(async (id) => {
        if (!isMestre) return false;
        const previa = validarPedido(useStore.getState().sextaFeiraPendentes?.[id]);
        if (previa.erro) { dialogos.avisar(`${previa.erro} Recuse o pedido.`, 'erro'); return false; }
        // Pega o pedido da fila de forma atômica: dois Mestres não aprovam o mesmo pedido.
        let pedido;
        try {
            pedido = await reivindicarPendente(mesaId, id);
        } catch (err) {
            dialogos.avisar(`Não foi possível aprovar: ${err?.message || 'erro de conexão'}.`, 'erro');
            return false;
        }
        if (!pedido) { dialogos.avisar('Este pedido já foi tratado.', 'erro'); return false; }
        const { objeto, alvo, erro } = validarPedido(pedido);
        if (erro) {
            Promise.resolve(enviarPendente(mesaId, pedido)).catch(() => {});
            dialogos.avisar(erro, 'erro');
            return false;
        }
        try {
            await gravarCriacao({ tipo: pedido.tipo, objeto, alvo });
        } catch (err) {
            // Não gravou: devolve o pedido pra fila, pra não sumir.
            Promise.resolve(enviarPendente(mesaId, pedido)).catch(() => {});
            dialogos.avisar(`Não foi possível aprovar: ${err?.message || 'erro desconhecido'}.`, 'erro');
            return false;
        }
        Promise.resolve(registrarDecisao(mesaId, { solicitante: pedido.solicitante, nomeCriacao: objeto.nome, tipo: pedido.tipo, aprovado: true })).catch(() => {});
        dialogos.avisar(`✅ "${objeto.nome}" aprovado e adicionado a ${alvo}.`);
        return true;
    }, [isMestre, mesaId, gravarCriacao, dialogos, validarPedido]);

    const recusarPendente = useCallback(async (id) => {
        const pedido = useStore.getState().sextaFeiraPendentes?.[id];
        if (!isMestre || !pedido) return false;
        const ok = await dialogos.confirmar({ titulo: '❌ Recusar pedido', mensagem: `Recusar "${pedido.objeto?.nome || 'pedido'}" de ${pedido.solicitante}?`, textoConfirmar: 'Recusar', perigo: true });
        if (!ok) return false;
        try {
            if (!(await reivindicarPendente(mesaId, id))) { dialogos.avisar('Este pedido já foi tratado.', 'erro'); return false; }
            Promise.resolve(registrarDecisao(mesaId, { solicitante: pedido.solicitante, nomeCriacao: pedido.objeto?.nome, tipo: pedido.tipo, aprovado: false })).catch(() => {});
            return true;
        } catch (err) {
            dialogos.avisar(`Não foi possível recusar: ${err?.message || 'erro desconhecido'}.`, 'erro');
            return false;
        }
    }, [isMestre, mesaId, dialogos]);

    // 🔔 O jogador é avisado quando o Mestre decide um pedido dele (só decisões novas).
    const sextaFeiraDecisoes = useStore(s => s.sextaFeiraDecisoes);
    const montadoEmRef = useRef(Date.now());
    const decisoesVistasRef = useRef(new Set());
    useEffect(() => {
        Object.entries(sextaFeiraDecisoes || {}).forEach(([id, d]) => {
            if (!d || decisoesVistasRef.current.has(id)) return;
            decisoesVistasRef.current.add(id);
            if (Number(d.em) < montadoEmRef.current || sanitizarNome(d.solicitante || '') !== sanitizarNome(meuNome || '')) return;
            dialogos.avisar(d.aprovado ? `✅ O Mestre aprovou "${d.nomeCriacao}". Já está na sua ficha.` : `❌ O Mestre recusou "${d.nomeCriacao}".`, d.aprovado ? 'ok' : 'erro');
        });
    }, [sextaFeiraDecisoes, meuNome, dialogos]);

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
        sextaFeiraConfig, iaConfigurada, salvarConfigSextaFeira,
        sextaFeiraMemoria, memorizarTexto, esquecerFato, resumirSessao,
        preferencias, alternarPreferencia, respostaParcial, alvosMencao, tentarDeNovo, pararVoz,
        dialogos, historicoDisponivel, listarVersoesDoArcoAtivo, restaurarVersao, carregarLixeira, restaurarDaLixeira,
        sextaFeiraPendentes, aplicarProposta, enviarPropostaParaAprovacao, descartarProposta, aprovarPendente, recusarPendente
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
        sextaFeiraConfig, iaConfigurada, salvarConfigSextaFeira,
        sextaFeiraMemoria, memorizarTexto, esquecerFato, resumirSessao,
        preferencias, alternarPreferencia, respostaParcial, alvosMencao, tentarDeNovo,
        dialogos, historicoDisponivel, listarVersoesDoArcoAtivo, restaurarVersao, carregarLixeira, restaurarDaLixeira,
        sextaFeiraPendentes, aplicarProposta, enviarPropostaParaAprovacao, descartarProposta, aprovarPendente, recusarPendente
    ]);

    return (
        <AIFormContext.Provider value={value}>
            {children}
        </AIFormContext.Provider>
    );
}