import React, { createContext, useContext, useState, useRef, useMemo, useEffect, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { getMaximo } from '../../core/attributes';
import { uploadImagem } from '../../services/firebase-sync';
import { useFichaAtiva, useCallSaveAtivo, useSalvarImediatoAtivo } from '../Ficha Def/FichaAlvoContext';
import { normalizarPasta, listarCaminhosPastas, renomearCaminhoPasta } from '../../core/pastas';
// 🔥 CORREÇÃO: a matemática "segura" que substituiu capturarMaximosAtuais/rescalarVitaisProporcional
// aqui na verdade misturava escalas -- comparava `ficha[v].atual` (SEMPRE guardado na escala
// COMPRIMIDA de calcVitalScale) contra `getMaximo(ficha, v)` (escala BRUTA/descomprimida) pra tirar
// uma "%", produzindo uma porcentagem errada sempre que o Máximo bruto do personagem já tivesse
// cruzado uma fronteira de compressão -- exatamente a população de personagens fortes/ascendidos
// pra quem essa compressão existe. `capturarMaximosAtuais`/`rescalarVitaisProporcional` (usadas
// corretamente em `arsenal/ArsenalFormContext.jsx`) já fazem essa conta na escala certa e têm testes
// dedicados (`core/vitals.rescalarVitais.test.js`) -- voltamos a usá-las.
import { getVitalMxDisplay, capturarMaximosAtuais, rescalarVitaisProporcional } from '../../core/vitals';
import { calcularGanhoFadigaOvercharge, calcularMultiplicadorOvercharge } from '../../core/dominios';
import { calcularGanhoFadigaMaestriaInsuficiente } from '../../core/fadiga';
import { ESTAGIOS_PADRAO, normalizarEstagios, temEstagios, limitarEstagio, marcoParaRascunho } from '../../core/estagios';

// 🪜 Rascunho do bloco "Estágios" do editor — nomes ficam como texto (um por linha) enquanto edita.
const estagiosEditorVazio = () => ({ ...ESTAGIOS_PADRAO, nomes: '' });

export const SINGULAR = {
    'habilidade': 'Habilidade',
    'forma': 'Forma',
    'poder': 'Poder'
};

const PoderesFormContext = createContext(null);

export function usePoderesForm() {
    const ctx = useContext(PoderesFormContext);
    if (!ctx) return null;
    return ctx;
}

export function PoderesFormProvider({ children }) {
    // 🔥 GRIMÓRIO DA ENTIDADE: dentro de um FichaAlvoProvider mirando outro personagem (livro do
    // Mestre, components/mestre/LivroEntidade.jsx) tudo aqui lê e grava a ficha DELE; fora disso é a
    // minha ficha, exatamente como sempre (FichaAlvoContext.jsx > useFichaAtiva).
    const { ficha: minhaFicha, updateFicha, nome: meuNome, souEuMesmo } = useFichaAtiva();
    const isMestre = useStore(s => s.isMestre);
    const salvarFichaSilencioso = useCallSaveAtivo();
    const salvarFirebaseImediato = useSalvarImediatoAtivo();

    // O rascunho do editor (efeitos e "editando qual") mora na store pra MINHA ficha; para outro
    // personagem fica local, pra não se misturar com o meu editor aberto na minha própria aba.
    const efeitosTempGlobal = useStore(s => s.efeitosTemp);
    const setEfeitosTempGlobal = useStore(s => s.setEfeitosTemp);
    const efeitosTempPassivosGlobal = useStore(s => s.efeitosTempPassivos);
    const setEfeitosTempPassivosGlobal = useStore(s => s.setEfeitosTempPassivos);
    const poderEditandoIdGlobal = useStore(s => s.poderEditandoId);
    const setPoderEditandoIdGlobal = useStore(s => s.setPoderEditandoId);
    const [efeitosTempLocal, setEfeitosTempLocal] = useState([]);
    const [efeitosTempPassivosLocal, setEfeitosTempPassivosLocal] = useState([]);
    const [poderEditandoIdLocal, setPoderEditandoIdLocal] = useState(null);
    const efeitosTemp = souEuMesmo ? efeitosTempGlobal : efeitosTempLocal;
    const setEfeitosTemp = souEuMesmo ? setEfeitosTempGlobal : setEfeitosTempLocal;
    const efeitosTempPassivos = souEuMesmo ? efeitosTempPassivosGlobal : efeitosTempPassivosLocal;
    const setEfeitosTempPassivos = souEuMesmo ? setEfeitosTempPassivosGlobal : setEfeitosTempPassivosLocal;
    const poderEditandoId = souEuMesmo ? poderEditandoIdGlobal : poderEditandoIdLocal;
    const setPoderEditandoId = souEuMesmo ? setPoderEditandoIdGlobal : setPoderEditandoIdLocal;

    const [abaAtual, setAbaAtual] = useState('habilidade');

    const [nomePoder, setNomePoder] = useState('');
    const [descricaoPoder, setDescricaoPoder] = useState(''); 
    const [poderVertente, setPoderVertente] = useState('');
    const [poderElemento, setPoderElemento] = useState('');
    const [elementosAfetados, setElementosAfetados] = useState(''); 
    const [imagemUrl, setImagemUrl] = useState('');
    const [dadosQtd, setDadosQtd] = useState(0);
    const [dadosFaces, setDadosFaces] = useState(20);
    const [custoPercentual, setCustoPercentual] = useState(0);
    const [poderAlcance, setPoderAlcance] = useState(1);
    const [poderArea, setPoderArea] = useState(0);
    const [armaVinculada, setArmaVinculada] = useState('');
    const [maestriaPoder, setMaestriaPoder] = useState(0);
    const [fadigaPorUsoPoder, setFadigaPorUsoPoder] = useState(15);
    const [maestriaRequeridaPoder, setMaestriaRequeridaPoder] = useState(0);
    const [pastaPoder, setPastaPoder] = useState('');
    const [estagiosEditor, setEstagiosEditorBruto] = useState(estagiosEditorVazio);
    const setEstagiosEditor = useCallback((parcial) => setEstagiosEditorBruto(prev => ({ ...prev, ...parcial })), []);
    
    const [nomeEfeito, setNomeEfeito] = useState('');
    const [novoAtr, setNovoAtr] = useState('forca');
    const [novoProp, setNovoProp] = useState('base');
    const [novoVal, setNovoVal] = useState('');
    
    const [nomeEfeitoPassivo, setNomeEfeitoPassivo] = useState('');
    const [novoAtrPassivo, setNovoAtrPassivo] = useState('evasiva');
    const [novoPropPassivo, setNovoPropPassivo] = useState('base');
    const [novoValPassivo, setNovoValPassivo] = useState('');

    const [uploadingImg, setUploadingImg] = useState(false);
    const [vincularAberto, setVincularAberto] = useState(null);

    const [poderPreparandoId, setPoderPreparandoId] = useState(null);
    const [overchargeAtivo, setOverchargeAtivo] = useState(false);

    const formRef = useRef(null);
    const vincularRef = useRef(null);

    useEffect(() => {
        if (!vincularAberto) return;
        const handler = (e) => {
            if (vincularRef.current && !vincularRef.current.contains(e.target)) {
                setVincularAberto(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [vincularAberto]);

    const addEfeitoTemp = useCallback(() => {
        if (!novoVal || !nomeEfeito.trim()) { alert('Preencha o nome e o valor do efeito!'); return; }
        setEfeitosTemp([...efeitosTemp, { nome: nomeEfeito.trim(), atributo: novoAtr, propriedade: novoProp, valor: novoVal }]);
        setNovoVal('');
        setNomeEfeito('');
    }, [novoVal, nomeEfeito, novoAtr, novoProp, efeitosTemp, setEfeitosTemp]);

    const removerEfeitoTemp = useCallback((index) => {
        setEfeitosTemp(efeitosTemp.filter((_, i) => i !== index));
    }, [efeitosTemp, setEfeitosTemp]);

    const addEfeitoPassivoTemp = useCallback(() => {
        if (!novoValPassivo || !nomeEfeitoPassivo.trim()) { alert('Preencha o nome e o valor do efeito passivo!'); return; }
        setEfeitosTempPassivos([...efeitosTempPassivos, { nome: nomeEfeitoPassivo.trim(), atributo: novoAtrPassivo, propriedade: novoPropPassivo, valor: novoValPassivo }]);
        setNovoValPassivo('');
        setNomeEfeitoPassivo('');
    }, [novoValPassivo, nomeEfeitoPassivo, novoAtrPassivo, novoPropPassivo, efeitosTempPassivos, setEfeitosTempPassivos]);

    const removerEfeitoPassivoTemp = useCallback((index) => {
        setEfeitosTempPassivos(efeitosTempPassivos.filter((_, i) => i !== index));
    }, [efeitosTempPassivos, setEfeitosTempPassivos]);

    const handleImageUpload = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setUploadingImg(true);
        try {
            const urlPermanente = await uploadImagem(file, `poderes/${meuNome || 'desconhecido'}`);
            setImagemUrl(urlPermanente);
        } catch (err) {
            console.error(err);
            alert('Erro ao enviar a imagem!');
        } finally {
            setUploadingImg(false);
        }
    }, [meuNome]);

    const cancelarEdicaoPoder = useCallback(() => {
        setPoderEditandoId(null);
        setNomePoder('');
        setDescricaoPoder(''); 
        setPoderVertente('');
        setPoderElemento('');
        setElementosAfetados(''); 
        setImagemUrl('');
        setDadosQtd(0);
        setDadosFaces(20);
        setCustoPercentual(0);
        setPoderAlcance(1);
        setPoderArea(0); 
        setArmaVinculada('');
        setMaestriaPoder(0);
        setFadigaPorUsoPoder(15);
        // Sem isto, a próxima Habilidade criada herdava a Maestria Requerida da última editada.
        setMaestriaRequeridaPoder(0);
        setPastaPoder('');
        setEstagiosEditorBruto(estagiosEditorVazio());
        setEfeitosTemp([]);
        setEfeitosTempPassivos([]);
        setNovoAtrPassivo('evasiva');
        setNovoPropPassivo('base');
        setNovoValPassivo('');
    }, [setPoderEditandoId, setEfeitosTemp, setEfeitosTempPassivos]);

    const salvarNovoPoder = useCallback(() => {
        const n = nomePoder.trim();
        if (!n || (!efeitosTemp.length && !efeitosTempPassivos.length && dadosQtd === 0 && !descricaoPoder.trim())) {
            alert('Falta nome ou efeitos (ou dados/descrição)!');
            return;
        }

        const descSafe = descricaoPoder || "";
        const vertSafe = poderVertente || "";
        const elemSafe = poderElemento || "";
        const afetaSafe = elementosAfetados || "";
        const urlSafe = imagemUrl || "";
        const armaSafe = armaVinculada || "";
        // 🪜 Estágios (core/estagios.js): só grava a config quando ligada; desligar apaga tudo.
        const estagiosSalvos = estagiosEditor.habilitado ? normalizarEstagios(estagiosEditor) : null;
        const aplicarEstagios = (poder) => {
            if (estagiosSalvos) {
                poder.estagios = estagiosSalvos;
                poder.estagioAtual = limitarEstagio(poder, poder.estagioAtual ?? 1);
            } else {
                delete poder.estagios;
                delete poder.estagioAtual;
            }
        };

        updateFicha((ficha) => {
            if (!ficha.poderes) ficha.poderes = [];

            if (poderEditandoId) {
                const ix = ficha.poderes.findIndex(p => p.id === poderEditandoId);
                if (ix !== -1) {
                    ficha.poderes[ix].nome = n;
                    ficha.poderes[ix].descricao = descSafe; 
                    ficha.poderes[ix].vertente = vertSafe; 
                    ficha.poderes[ix].elemento = elemSafe; 
                    ficha.poderes[ix].elementosAfetados = afetaSafe; 
                    ficha.poderes[ix].categoria = abaAtual;
                    ficha.poderes[ix].efeitos = JSON.parse(JSON.stringify(efeitosTemp));
                    ficha.poderes[ix].efeitosPassivos = JSON.parse(JSON.stringify(efeitosTempPassivos));
                    ficha.poderes[ix].imagemUrl = urlSafe;
                    ficha.poderes[ix].dadosQtd = parseInt(dadosQtd) || 0;
                    ficha.poderes[ix].dadosFaces = parseInt(dadosFaces) || 20;
                    ficha.poderes[ix].custoPercentual = parseFloat(custoPercentual) || 0;
                    ficha.poderes[ix].alcance = parseFloat(poderAlcance) || 1;
                    ficha.poderes[ix].area = parseFloat(poderArea) || 0;
                    ficha.poderes[ix].armaVinculada = armaSafe;
                    if (abaAtual === 'forma') {
                        ficha.poderes[ix].maestria = Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0));
                        ficha.poderes[ix].fadigaPorUso = Math.max(0, parseFloat(fadigaPorUsoPoder) || 0);
                        delete ficha.poderes[ix].maestriaRequerida;
                    } else if (abaAtual === 'habilidade' || abaAtual === 'poder') {
                        // 🎓 Poderes ganharam a MESMA Maestria própria de Habilidades (pedido do
                        // usuário: paridade entre as 3 categorias) — o quanto o personagem já
                        // domina ESTE Poder específico, comparado contra maestriaRequerida (ver
                        // core/fadiga.js > calcularGanhoFadigaMaestriaInsuficiente).
                        ficha.poderes[ix].maestria = Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0));
                        ficha.poderes[ix].maestriaRequerida = Math.min(100, Math.max(0, parseFloat(maestriaRequeridaPoder) || 0));
                        delete ficha.poderes[ix].fadigaPorUso;
                    } else {
                        delete ficha.poderes[ix].maestria;
                        delete ficha.poderes[ix].maestriaRequerida;
                        delete ficha.poderes[ix].fadigaPorUso;
                    }
                    // 🗂️ Pasta: hoje disponível pra QUALQUER categoria (Formas, Habilidades e
                    // Poderes), não só Formas — pedido do usuário pra organizar o Grimório inteiro
                    // (e, por tabela, a lista de Técnicas Rápidas do Mapa) em pastas.
                    ficha.poderes[ix].pasta = normalizarPasta(pastaPoder);
                    aplicarEstagios(ficha.poderes[ix]);
                }
            } else {
                const novoPoder = {
                    id: Date.now(),
                    nome: n,
                    descricao: descSafe, 
                    vertente: vertSafe, 
                    elemento: elemSafe, 
                    elementosAfetados: afetaSafe, 
                    categoria: abaAtual,
                    ativa: false,
                    efeitos: JSON.parse(JSON.stringify(efeitosTemp)),
                    efeitosPassivos: JSON.parse(JSON.stringify(efeitosTempPassivos)),
                    imagemUrl: urlSafe,
                    dadosQtd: parseInt(dadosQtd) || 0,
                    dadosFaces: parseInt(dadosFaces) || 20,
                    custoPercentual: parseFloat(custoPercentual) || 0,
                    alcance: parseFloat(poderAlcance) || 1,
                    area: parseFloat(poderArea) || 0,
                    armaVinculada: armaSafe,
                    // 🗂️ Pasta: disponível pra QUALQUER categoria (ver comentário em cima, no
                    // ramo de edição) — sempre gravada, igual já era só pra Forma antes.
                    pasta: normalizarPasta(pastaPoder),
                    ...(abaAtual === 'forma' ? {
                        maestria: Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0)),
                        fadigaPorUso: Math.max(0, parseFloat(fadigaPorUsoPoder) || 0),
                    } : (abaAtual === 'habilidade' || abaAtual === 'poder') ? {
                        maestria: Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0)),
                        maestriaRequerida: Math.min(100, Math.max(0, parseFloat(maestriaRequeridaPoder) || 0))
                    } : {})
                };
                aplicarEstagios(novoPoder);
                ficha.poderes.push(novoPoder);
            }
        });

        salvarFirebaseImediato().then(() => {
            cancelarEdicaoPoder();
        }).catch(() => {
            alert('Erro ao sincronizar no Firebase!');
        });
    }, [nomePoder, efeitosTemp, efeitosTempPassivos, dadosQtd, descricaoPoder, updateFicha, poderEditandoId, poderVertente, poderElemento, elementosAfetados, abaAtual, imagemUrl, dadosFaces, custoPercentual, poderAlcance, poderArea, armaVinculada, maestriaPoder, fadigaPorUsoPoder, maestriaRequeridaPoder, pastaPoder, estagiosEditor, cancelarEdicaoPoder, salvarFirebaseImediato]);

    // 🔥 O ESCUDO ANTI-DRENAGEM (Resolve a perda acidental de energia ao Ligar a Forma) 🔥
    const togglePoder = useCallback((id) => {
        updateFicha((ficha) => {
            if (!ficha.poderes) return;
            const p = ficha.poderes.find(po => po.id === id);
            if (!p) return;

            // 1. Antes de ligar/desligar, capturamos os Máximos ESTÁVEIS de cada barra.
            const oldM = capturarMaximosAtuais(ficha);

            // 2. Mudamos o status da forma (o que engatilha o novo Máximo de Status)
            p.ativa = !p.ativa;

            // 3. Re-escala "atual" de cada barra pra manter a MESMA % no novo Máximo. (Nada se gasta!)
            rescalarVitaisProporcional(ficha, oldM);
        });

        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    // 🪜 Sobe/desce o estágio (core/estagios.js). Ativa, a técnica muda os máximos na hora — mesmo
    // travamento de vitais do liga/desliga, pra trocar de estágio nunca drenar Vida/Energia.
    const mudarEstagioPoder = useCallback((id, novoEstagio) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === id);
            if (!p || !temEstagios(p)) return;
            const alvo = limitarEstagio(p, novoEstagio);
            if (p.estagioAtual === alvo) return;
            const oldM = capturarMaximosAtuais(ficha);
            p.estagioAtual = alvo;
            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const editarPoder = useCallback((id) => {
        const p = (minhaFicha?.poderes || []).find(po => po.id === id);
        if (!p) return;
        
        if (p.ativa) {
            togglePoder(id);
            alert(`A técnica [${p.nome}] foi DESATIVADA temporariamente para edição.`);
        }
        
        setPoderEditandoId(p.id);
        setAbaAtual(p.categoria || 'poder');
        setNomePoder(p.nome);
        setDescricaoPoder(p.descricao || ''); 
        setPoderVertente(p.vertente || ''); 
        setPoderElemento(p.elemento || ''); 
        setElementosAfetados(p.elementosAfetados || ''); 
        setImagemUrl(p.imagemUrl || '');
        setDadosQtd(p.dadosQtd || 0);
        setDadosFaces(p.dadosFaces || 20);
        setCustoPercentual(p.custoPercentual || 0);
        setPoderAlcance(p.alcance || 1);
        setPoderArea(p.area || 0);
        setArmaVinculada(p.armaVinculada || '');
        setMaestriaPoder(p.maestria || 0);
        setFadigaPorUsoPoder(p.fadigaPorUso !== undefined ? p.fadigaPorUso : 15);
        setMaestriaRequeridaPoder(p.maestriaRequerida || 0);
        setPastaPoder(p.pasta || '');
        if (temEstagios(p)) {
            const cfg = normalizarEstagios(p.estagios);
            setEstagiosEditorBruto({ ...cfg, nomes: cfg.nomes.join('\n'), marcos: cfg.marcos.map(marcoParaRascunho) });
        } else {
            setEstagiosEditorBruto(estagiosEditorVazio());
        }
        setEfeitosTemp(JSON.parse(JSON.stringify(p.efeitos || [])));
        setEfeitosTempPassivos(JSON.parse(JSON.stringify(p.efeitosPassivos || [])));

        if (formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [minhaFicha, setPoderEditandoId, setEfeitosTemp, setEfeitosTempPassivos, togglePoder]);

    const deletarPoder = useCallback((id) => {
        if (!window.confirm('Tem certeza que deseja rasgar esta página permanentemente?')) return;
        const p = (minhaFicha?.poderes || []).find(po => po.id === id);
        if (p && p.ativa) togglePoder(id);

        updateFicha((ficha) => { ficha.poderes = (ficha.poderes || []).filter(po => po.id !== id); });
        salvarFichaSilencioso();
    }, [minhaFicha, togglePoder, updateFicha, salvarFichaSilencioso]);

    const vincularArmaAoPoder = useCallback((poderId, armaId) => {
        updateFicha((ficha) => {
            if (!ficha.poderes) return;
            const p = ficha.poderes.find(po => po.id === poderId);
            if (p) p.armaVinculada = armaId;
        });
        setVincularAberto(null);
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    // 🔥 ESCUDOS ANTI-DRENAGEM NO EDITOR DE SUB-FORMAS 🔥
    const salvarFormaPoder = useCallback((poderId, forma) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;

            const oldM = capturarMaximosAtuais(ficha);

            if (!p.formas) p.formas = [];
            const ix = p.formas.findIndex(f => f.id === forma.id);
            if (ix !== -1) {
                p.formas[ix] = forma;
            } else {
                p.formas.push(forma);
            }

            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const deletarFormaPoder = useCallback((poderId, formaId) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;

            const oldM = capturarMaximosAtuais(ficha);

            p.formas = (p.formas || []).filter(f => f.id !== formaId);
            if (p.formaAtivaId === formaId) p.formaAtivaId = null;

            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const ativarFormaPoder = useCallback((poderId, formaId) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;

            const oldM = capturarMaximosAtuais(ficha);

            p.formaAtivaId = formaId;

            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const armasEquipadas = useMemo(() => (minhaFicha?.inventario || []).filter(i => i.tipo === 'arma' && i.equipado), [minhaFicha]);
    const poderesGlobais = minhaFicha?.poderes || [];
    const passivas = minhaFicha?.passivas || [];

    const itensFiltrados = useMemo(() => {
        return poderesGlobais.filter(p => {
            const cat = (p.categoria || 'poder').toLowerCase();
            const alvo = abaAtual.toLowerCase();
            return cat === alvo;
        });
    }, [poderesGlobais, abaAtual]);

    // 🗂️ Pastas existentes pra sugestão (datalist) no campo Pasta do editor — olha pra TODOS os
    // poderes (Formas, Habilidades e Poderes), não só Formas, já que a Pasta deixou de ser
    // exclusiva de Forma (ver salvarNovoPoder acima).
    const pastasExistentes = useMemo(() => {
        // Inclui as pastas-mãe de cada caminho ("A/B" traz "A" e "A/B") — core/pastas.js.
        return listarCaminhosPastas(poderesGlobais);
    }, [poderesGlobais]);

    // 🗂️ Renomeia (ou remove, se pastaNova vier vazia) uma pasta nos poderes que a usam — nome
    // mantido (renomearPastaForma) por compatibilidade com quem já chama esta função, mas não é
    // mais exclusiva de Forma. `categoria` (opcional) escopa a operação só aos poderes DAQUELA
    // categoria — a UI (PoderesSubComponents.jsx > renomearOuRemoverPasta) sempre passa a aba
    // atual, pra renomear uma pasta na aba Habilidades nunca afetar sem querer uma Forma ou Poder
    // que reusa o mesmo nome de pasta. Omitir `categoria` (ex: chamada direta em testes/scripts)
    // continua renomeando em TODAS as categorias, comportamento original desta função.
    const renomearPastaForma = useCallback((pastaAntiga, pastaNova, categoria) => {
        const novaLimpa = normalizarPasta(pastaNova);
        const catAlvo = categoria ? categoria.toLowerCase() : null;
        updateFicha((ficha) => {
            (ficha.poderes || []).forEach(p => {
                if (!p) return;
                if (catAlvo && (p.categoria || '').toLowerCase() !== catAlvo) return;
                // Renomear/mover uma pasta leva as subpastas junto (core/pastas.js > renomearCaminhoPasta).
                const atual = (p.pasta || '').trim();
                const nova = renomearCaminhoPasta(atual, pastaAntiga, novaLimpa);
                if (nova !== atual) p.pasta = nova;
            });
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const relatorioAuditoria = useMemo(() => {
        const nomesProps = { mbase: 'MULT BASE (x)', mgeral: 'MULT GERAL (x)', mformas: 'MULT FORMA (x)', mabs: 'MULT ABSOLUTO (x)', munico: 'MULT UNICO (x)', base: 'VALOR BRUTO (+)' };
        const mapaEfeitos = { mbase: [], mgeral: [], mformas: [], mabs: [], munico: [], base: [], especial: [] };

        const coletarEfeitos = (nome, efeitos) => {
            if (!efeitos) return;
            efeitos.forEach(ef => {
                const txt = { nome, atributo: ef.atributo, valor: ef.valor };
                if (mapaEfeitos[ef.propriedade]) mapaEfeitos[ef.propriedade].push(txt);
                else mapaEfeitos.especial.push(txt);
            });
        };

        poderesGlobais.forEach(p => { if (p && p.efeitosPassivos) coletarEfeitos(p.nome, p.efeitosPassivos); });
        passivas.forEach(p => { if (p && p.efeitos) coletarEfeitos(p.nome, p.efeitos); });

        let hasContent = false;
        const sections = [];
        for (const prop in nomesProps) {
            if (mapaEfeitos[prop].length > 0) {
                hasContent = true;
                sections.push(
                    <div key={prop} style={{ marginBottom: 6 }}>
                        <strong>{nomesProps[prop]}:</strong>{' '}
                        {mapaEfeitos[prop].map((t, i) => (
                            <span key={i}>
                                {i > 0 && <strong> + </strong>}
                                <span>{t.nome}</span>
                                <span style={{ opacity: 0.6, fontStyle: 'italic' }}> ({(t.atributo || '').toUpperCase()}: {t.valor})</span>
                            </span>
                        ))}
                    </div>
                );
            }
        }
        if (mapaEfeitos.especial.length > 0) {
            hasContent = true;
            sections.push(
                <div key="especial" style={{ marginBottom: 6 }}>
                    <strong>OUTROS EFEITOS:</strong>{' '}
                    {mapaEfeitos.especial.map((t, i) => (
                        <span key={i}>
                            {i > 0 && <strong> + </strong>}
                            <span>{t.nome}</span>
                            <span style={{ opacity: 0.6, fontStyle: 'italic' }}> ({(t.atributo || '').toUpperCase()}: {t.valor})</span>
                        </span>
                    ))}
                </div>
            );
        }
        if (!hasContent) return null;
        return sections;
    }, [poderesGlobais, passivas]);

    const getAtualVital = useCallback((key) => {
        if (!minhaFicha) return 0;
        const max = getMaximo(minhaFicha, key);
        if (minhaFicha[key] && minhaFicha[key].atual !== undefined) return minhaFicha[key].atual;
        return max;
    }, [minhaFicha]);

    const curMana = getAtualVital('mana');
    const curAura = getAtualVital('aura');
    const curChakra = getAtualVital('chakra');
    const energiaElemental = curMana + curAura + curChakra;
    const danoBruto = minhaFicha?.dano?.danoBruto || 0;

    const dispararAtaque = useCallback((poder) => {
        let custoFinalPerc = poder.custoPercentual || 0;
        const vertenteLower = (poder.vertente || '').toLowerCase();
        const isHabilidadeElemental = vertenteLower.includes('elemental');
        const multOvercharge = isHabilidadeElemental ? calcularMultiplicadorOvercharge(minhaFicha, poder.elemento) : 2;
        const overchargeGeraFadiga = isHabilidadeElemental && overchargeAtivo;

        if (isHabilidadeElemental) {
            custoFinalPerc = overchargeAtivo ? ((parseFloat(poder.custoPercentual) || 0) * multOvercharge) : 0;
        }

        // 🎓 Maestria insuficiente gera Fadiga instantânea em Habilidades E Poderes (Poderes
        // ganharam a mesma Maestria de Habilidades — pedido do usuário, paridade entre as 3
        // categorias); Formas não entram aqui (a Maestria delas afeta a Fadiga DINÂMICA contínua
        // enquanto a transformação está ativa, ver core/fadiga.js > getFatorFormasAtivas, não este
        // ganho instantâneo por disparo).
        const categoriaLower = (poder.categoria || '').toLowerCase();
        const usaMaestriaDeDisparo = categoriaLower === 'habilidade' || categoriaLower === 'poder';
        const ganhoFadigaMaestria = (usaMaestriaDeDisparo && (parseFloat(poder.maestriaRequerida) || 0) > 0)
            ? calcularGanhoFadigaMaestriaInsuficiente(poder.maestria, poder.maestriaRequerida)
            : 0;

        if (custoFinalPerc > 0 || overchargeGeraFadiga || ganhoFadigaMaestria > 0) {
            updateFicha(ficha => {
                if (custoFinalPerc > 0) {
                    ['mana', 'aura', 'chakra'].forEach(v => {
                        let maxDisplay = getVitalMxDisplay(v, ficha);
                        let drain = Math.floor(maxDisplay * (custoFinalPerc / 100));
                        let curr = ficha[v]?.atual !== undefined ? ficha[v].atual : maxDisplay;
                        if (!ficha[v]) ficha[v] = {};
                        ficha[v].atual = Math.max(0, curr - drain);
                    });
                }
                if (overchargeGeraFadiga || ganhoFadigaMaestria > 0) {
                    if (!ficha.combate) ficha.combate = {};
                    let ganhoTotal = 0;
                    if (overchargeGeraFadiga) ganhoTotal += calcularGanhoFadigaOvercharge(ficha, poder.elemento);
                    ganhoTotal += ganhoFadigaMaestria;
                    ficha.combate.fadigaExtra = Math.max(0, (Number(ficha.combate.fadigaExtra) || 0) + ganhoTotal);
                }
            });
            salvarFichaSilencioso();
        }

        let msg = `[ ${poder.nome.toUpperCase()} ] disparado!\n\n`;
        msg += `🎲 Dano Base dos Dados: ${poder.dadosQtd}d${poder.dadosFaces}\n`;
        msg += `➕ Dano Bruto da Ficha: +${danoBruto}\n`;

        if (isHabilidadeElemental) {
            msg += `🌪️ Ressonância do Elemento (${poder.elemento}): +${energiaElemental}\n`;
            if (poder.elementosAfetados) msg += `🌊 Afeta/Consome: ${poder.elementosAfetados}\n`;
            if (overchargeAtivo) {
                msg += `\n🔥 OVERCHARGE ATIVADO!\n`;
                // Sem Multiplicador Potencial: os Multiplicadores de Dano agora só valem no Poder Calculado.
                let danoTotalFlat = Math.floor(danoBruto + energiaElemental);
                msg += `💥 Dano Flat Estimado (Sem os dados): ${danoTotalFlat}\n`;
                msg += `🔻 Custo Aplicado: ${custoFinalPerc.toFixed(1)}% drenado da Mana, Aura e Chakra (x${multOvercharge.toFixed(2)}, pelo seu Domínio de ${poder.elemento || '?'}).\n`;
            } else {
                let danoTotalFlat = danoBruto + energiaElemental;
                msg += `💥 Dano Flat Estimado (Sem os dados): ${danoTotalFlat}\n`;
                msg += `💸 Custo: ZERO (Ressonância da Natureza).\n`;
            }
        } else {
            let danoTotalFlat = danoBruto;
            msg += `💥 Dano Flat Estimado (Sem os dados): ${danoTotalFlat}\n`;
            msg += `🔻 Custo Aplicado: ${custoFinalPerc}% drenado das Energias.\n`;
        }

        alert(msg);
        setPoderPreparandoId(null);
        setOverchargeAtivo(false);
    }, [overchargeAtivo, updateFicha, danoBruto, energiaElemental, minhaFicha, salvarFichaSilencioso]);

    const injetarJsonDaIA = useCallback((jsonString) => {
        try {
            const dados = JSON.parse(jsonString);
            let countP = 0;
            updateFicha(f => {
                const time = Date.now();
                if (dados.poderes && Array.isArray(dados.poderes)) {
                    if (!f.poderes) f.poderes = [];
                    dados.poderes.forEach((p, i) => {
                        f.poderes.push({
                            id: 'pw_ia_' + time + i,
                            nome: p.nome || 'Poder sem Nome',
                            descricao: p.descricao || '',
                            dadosQtd: parseInt(p.danoQtd) || 0,
                            dadosFaces: parseInt(p.danoFaces) || 0,
                            vertente: 'Físico',
                            categoria: abaAtual, 
                            ativa: false,
                            isForma: false,
                            notasIA: p.notasIA || '' 
                        });
                        countP++;
                    });
                }
            });
            salvarFirebaseImediato().catch(() => {});
            alert(`Sincronização Concluída!\n\n🗡️ Injetados na aba atual: ${countP} habilidades.`);
            return true;
        } catch (e) {
            alert("Erro no código da IA. Certifique-se de copiar o JSON completo.");
            return false;
        }
    }, [updateFicha, abaAtual, salvarFirebaseImediato]);

    const value = useMemo(() => ({
        minhaFicha, meuNome, isMestre, abaAtual, setAbaAtual,
        nomePoder, setNomePoder, descricaoPoder, setDescricaoPoder,
        poderVertente, setPoderVertente, poderElemento, setPoderElemento,
        elementosAfetados, setElementosAfetados, 
        imagemUrl, setImagemUrl, dadosQtd, setDadosQtd, dadosFaces, setDadosFaces,
        custoPercentual, setCustoPercentual, poderAlcance, setPoderAlcance,
        poderArea, setPoderArea, armaVinculada, setArmaVinculada,
        maestriaPoder, setMaestriaPoder, fadigaPorUsoPoder, setFadigaPorUsoPoder,
        maestriaRequeridaPoder, setMaestriaRequeridaPoder,
        pastaPoder, setPastaPoder, pastasExistentes, renomearPastaForma,
        estagiosEditor, setEstagiosEditor, mudarEstagioPoder,
        nomeEfeito, setNomeEfeito, novoAtr, setNovoAtr, novoProp, setNovoProp, novoVal, setNovoVal,
        nomeEfeitoPassivo, setNomeEfeitoPassivo, novoAtrPassivo, setNovoAtrPassivo,
        novoPropPassivo, setNovoPropPassivo, novoValPassivo, setNovoValPassivo,
        uploadingImg, setUploadingImg, vincularAberto, setVincularAberto,
        poderPreparandoId, setPoderPreparandoId, overchargeAtivo, setOverchargeAtivo,
        formRef, vincularRef,
        addEfeitoTemp, removerEfeitoTemp, addEfeitoPassivoTemp, removerEfeitoPassivoTemp,
        handleImageUpload, salvarNovoPoder, editarPoder, cancelarEdicaoPoder,
        togglePoder, deletarPoder, vincularArmaAoPoder, salvarFormaPoder,
        deletarFormaPoder, ativarFormaPoder,
        armasEquipadas, itensFiltrados, relatorioAuditoria,
        curMana, curAura, curChakra, energiaElemental, danoBruto,
        dispararAtaque, efeitosTemp, efeitosTempPassivos, poderEditandoId,
        injetarJsonDaIA
    }), [
        minhaFicha, meuNome, isMestre, abaAtual,
        nomePoder, descricaoPoder, poderVertente, poderElemento, elementosAfetados,
        imagemUrl, dadosQtd, dadosFaces, custoPercentual, poderAlcance,
        poderArea, armaVinculada, maestriaPoder, fadigaPorUsoPoder, maestriaRequeridaPoder, pastaPoder, pastasExistentes, renomearPastaForma,
        estagiosEditor, setEstagiosEditor, mudarEstagioPoder,
        nomeEfeito, novoAtr, novoProp, novoVal,
        nomeEfeitoPassivo, novoAtrPassivo, novoPropPassivo, novoValPassivo,
        uploadingImg, vincularAberto, poderPreparandoId, overchargeAtivo,
        addEfeitoTemp, removerEfeitoTemp, addEfeitoPassivoTemp, removerEfeitoPassivoTemp,
        handleImageUpload, salvarNovoPoder, editarPoder, cancelarEdicaoPoder,
        togglePoder, deletarPoder, vincularArmaAoPoder, salvarFormaPoder,
        deletarFormaPoder, ativarFormaPoder,
        armasEquipadas, itensFiltrados, relatorioAuditoria,
        curMana, curAura, curChakra, energiaElemental, danoBruto,
        dispararAtaque, efeitosTemp, efeitosTempPassivos, poderEditandoId, injetarJsonDaIA
    ]);

    return (
        <PoderesFormContext.Provider value={value}>
            {children}
        </PoderesFormContext.Provider>
    );
}