import React, { createContext, useContext, useState, useRef, useMemo, useEffect, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { getMaximo } from '../../core/attributes';
import { salvarFichaSilencioso, salvarFirebaseImediato, uploadImagem } from '../../services/firebase-sync';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from '../../core/vitals';
import { calcularGanhoFadigaOvercharge, calcularMultiplicadorOvercharge } from '../../core/dominios';

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
    const minhaFicha = useStore(s => s.minhaFicha);
    const meuNome = useStore(s => s.meuNome);
    const isMestre = useStore(s => s.isMestre);
    const updateFicha = useStore(s => s.updateFicha);
    const efeitosTemp = useStore(s => s.efeitosTemp);
    const setEfeitosTemp = useStore(s => s.setEfeitosTemp);
    const efeitosTempPassivos = useStore(s => s.efeitosTempPassivos);
    const setEfeitosTempPassivos = useStore(s => s.setEfeitosTempPassivos);
    const poderEditandoId = useStore(s => s.poderEditandoId);
    const setPoderEditandoId = useStore(s => s.setPoderEditandoId);

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
    // 🥋 Maestria (0-100%) — só relevante pra categoria 'forma' (ver core/fadiga.js): também define
    // até quanto de Poder liberado (Supressão) o personagem pode usar com esta Forma ativa SEM
    // acumular Fadiga (ex.: Maestria 60% = livre até 60% de Poder). 100% = Forma dominada, nunca
    // gera Fadiga por Poder.
    const [maestriaPoder, setMaestriaPoder] = useState(0);
    // 😮‍💨 Fadiga por Uso (pontos percentuais) — só relevante pra categoria 'forma': o quanto esta
    // Forma especificamente pesa na Fadiga dinâmica quando usada ACIMA da própria Maestria. Cada
    // Forma pode ser configurada como mais ou menos cansativa de sustentar além do que já é
    // dominado; sem valor definido, usa o padrão de 15 (ver PESO_MAX_DINAMICO_PADRAO).
    const [fadigaPorUsoPoder, setFadigaPorUsoPoder] = useState(15);
    // 🗂️ Pasta (organização) — só relevante pra categoria 'forma': agrupa Formas em pastas
    // nomeadas pelo próprio usuário na aba "🎭 Formas" do Grimório de Poderes.
    const [pastaPoder, setPastaPoder] = useState('');
    
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
        setPoderArea(0); // Correção de nomenclatura
        setArmaVinculada('');
        setMaestriaPoder(0);
        setFadigaPorUsoPoder(15);
        setPastaPoder('');
        setEfeitosTemp([]);
        setEfeitosTempPassivos([]);
        setNovoAtrPassivo('evasiva');
        setNovoPropPassivo('base');
        setNovoValPassivo('');
    }, [setPoderEditandoId, setEfeitosTemp, setEfeitosTempPassivos]);

    // ==========================================
    // 🛡️ O ESCUDO ANTI-VÁCUO DO FIREBASE 
    // ==========================================
    const salvarNovoPoder = useCallback(() => {
        const n = nomePoder.trim();
        if (!n || (!efeitosTemp.length && !efeitosTempPassivos.length && dadosQtd === 0 && !descricaoPoder.trim())) {
            alert('Falta nome ou efeitos (ou dados/descrição)!');
            return;
        }

        // Blindagem: Transforma "undefined" em valores seguros antes de tocar no Firebase
        const descSafe = descricaoPoder || "";
        const vertSafe = poderVertente || "";
        const elemSafe = poderElemento || "";
        const afetaSafe = elementosAfetados || "";
        const urlSafe = imagemUrl || "";
        const armaSafe = armaVinculada || "";

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
                        ficha.poderes[ix].pasta = (pastaPoder || '').trim();
                    } else {
                        delete ficha.poderes[ix].maestria;
                        delete ficha.poderes[ix].fadigaPorUso;
                        delete ficha.poderes[ix].pasta;
                    }
                }
            } else {
                ficha.poderes.push({
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
                    ...(abaAtual === 'forma' ? {
                        maestria: Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0)),
                        fadigaPorUso: Math.max(0, parseFloat(fadigaPorUsoPoder) || 0),
                        pasta: (pastaPoder || '').trim()
                    } : {})
                });
            }
        });

        salvarFirebaseImediato().then(() => {
            cancelarEdicaoPoder();
        }).catch(() => {
            alert('Erro ao sincronizar no Firebase!');
        });
    }, [nomePoder, efeitosTemp, efeitosTempPassivos, dadosQtd, descricaoPoder, updateFicha, poderEditandoId, poderVertente, poderElemento, elementosAfetados, abaAtual, imagemUrl, dadosFaces, custoPercentual, poderAlcance, poderArea, armaVinculada, maestriaPoder, fadigaPorUsoPoder, pastaPoder, cancelarEdicaoPoder]);

    const togglePoder = useCallback((id) => {
        updateFicha((ficha) => {
            if (!ficha.poderes) return;
            const p = ficha.poderes.find(po => po.id === id);
            if (!p) return;

            const oldM = capturarMaximosAtuais(ficha);
            p.ativa = !p.ativa;
            rescalarVitaisProporcional(ficha, oldM);
        });

        salvarFichaSilencioso();
    }, [updateFicha]);

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
        setPastaPoder(p.pasta || '');
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
    }, [minhaFicha, togglePoder, updateFicha]);

    const vincularArmaAoPoder = useCallback((poderId, armaId) => {
        updateFicha((ficha) => {
            if (!ficha.poderes) return;
            const p = ficha.poderes.find(po => po.id === poderId);
            if (p) p.armaVinculada = armaId;
        });
        setVincularAberto(null);
        salvarFichaSilencioso();
    }, [updateFicha]);

    const salvarFormaPoder = useCallback((poderId, forma) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;
            if (!p.formas) p.formas = [];
            const ix = p.formas.findIndex(f => f.id === forma.id);
            if (ix !== -1) {
                p.formas[ix] = forma;
            } else {
                p.formas.push(forma);
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const deletarFormaPoder = useCallback((poderId, formaId) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;
            p.formas = (p.formas || []).filter(f => f.id !== formaId);
            if (p.formaAtivaId === formaId) p.formaAtivaId = null;
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const ativarFormaPoder = useCallback((poderId, formaId) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;
            const oldM = capturarMaximosAtuais(ficha);
            p.formaAtivaId = formaId;
            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

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

    // 🗂️ Nomes de pasta já usados por alguma Forma — alimenta o <datalist> do campo Pasta no
    // formulário (sugestão de pastas existentes, sem impedir digitar uma nova).
    const pastasExistentes = useMemo(() => {
        const set = new Set();
        poderesGlobais.forEach(p => {
            if (p && (p.categoria || '').toLowerCase() === 'forma' && (p.pasta || '').trim()) {
                set.add(p.pasta.trim());
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [poderesGlobais]);

    // Renomeia (ou remove, se pastaNova vier vazia) uma pasta em TODAS as Formas que a usam de uma
    // vez, sem precisar editar Forma por Forma.
    const renomearPastaForma = useCallback((pastaAntiga, pastaNova) => {
        const novaLimpa = (pastaNova || '').trim();
        updateFicha((ficha) => {
            (ficha.poderes || []).forEach(p => {
                if (p && (p.categoria || '').toLowerCase() === 'forma' && (p.pasta || '').trim() === pastaAntiga) {
                    p.pasta = novaLimpa;
                }
            });
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

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
    const mPotencial = minhaFicha?.dano?.mPotencial || 1;
    const danoBruto = minhaFicha?.dano?.danoBruto || 0;

    // 🎓 DOMÍNIO ELEMENTAL (página 3 da Ficha, ficha.dominios) aplicado ao Overcharge de Técnicas
    // Elementais — ver core/dominios.js: quanto maior o nível do Domínio do elemento desta
    // técnica, MENOR o multiplicador de custo do Overcharge (2.0x sem domínio até 1.2x no nível
    // máximo) E MENOR a Fadiga instantânea que o Overcharge gera (zero no nível máximo, "Eterno").
    // Dá uma razão concreta e recorrente pra treinar a Hierarquia de Domínios.
    const dispararAtaque = useCallback((poder) => {
        let custoFinalPerc = poder.custoPercentual || 0;
        const vertenteLower = (poder.vertente || '').toLowerCase();
        const isHabilidadeElemental = vertenteLower.includes('elemental');
        const multOvercharge = isHabilidadeElemental ? calcularMultiplicadorOvercharge(minhaFicha, poder.elemento) : 2;
        const overchargeGeraFadiga = isHabilidadeElemental && overchargeAtivo;

        if (isHabilidadeElemental) {
            custoFinalPerc = overchargeAtivo ? (poder.custoPercentual * multOvercharge) : 0;
        }

        if (custoFinalPerc > 0 || overchargeGeraFadiga) {
            updateFicha(ficha => {
                if (custoFinalPerc > 0) {
                    ['mana', 'aura', 'chakra'].forEach(v => {
                        let max = getMaximo(ficha, v);
                        let drain = Math.floor(max * (custoFinalPerc / 100));
                        let curr = ficha[v]?.atual !== undefined ? ficha[v].atual : max;
                        if (!ficha[v]) ficha[v] = {};
                        ficha[v].atual = Math.max(0, curr - drain);
                    });
                }
                if (overchargeGeraFadiga) {
                    if (!ficha.combate) ficha.combate = {};
                    ficha.combate.fadigaExtra = Math.max(0, (Number(ficha.combate.fadigaExtra) || 0) + calcularGanhoFadigaOvercharge(ficha, poder.elemento));
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
                msg += `   ↳ Multiplicador Potencial Aplicado: x${mPotencial}\n`;
                let danoTotalFlat = Math.floor((danoBruto + energiaElemental) * mPotencial);
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
    }, [overchargeAtivo, updateFicha, danoBruto, energiaElemental, mPotencial, minhaFicha]);

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
            salvarFirebaseImediato();
            alert(`Sincronização Concluída!\n\n🗡️ Injetados na aba atual: ${countP} habilidades.`);
            return true;
        } catch (e) {
            alert("Erro no código da IA. Certifique-se de copiar o JSON completo.");
            return false;
        }
    }, [updateFicha, abaAtual]);

    const value = useMemo(() => ({
        minhaFicha, meuNome, isMestre, abaAtual, setAbaAtual,
        nomePoder, setNomePoder, descricaoPoder, setDescricaoPoder,
        poderVertente, setPoderVertente, poderElemento, setPoderElemento,
        elementosAfetados, setElementosAfetados, 
        imagemUrl, setImagemUrl, dadosQtd, setDadosQtd, dadosFaces, setDadosFaces,
        custoPercentual, setCustoPercentual, poderAlcance, setPoderAlcance,
        poderArea, setPoderArea, armaVinculada, setArmaVinculada,
        maestriaPoder, setMaestriaPoder, fadigaPorUsoPoder, setFadigaPorUsoPoder,
        pastaPoder, setPastaPoder, pastasExistentes, renomearPastaForma,
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
        curMana, curAura, curChakra, energiaElemental, mPotencial, danoBruto,
        dispararAtaque, efeitosTemp, efeitosTempPassivos, poderEditandoId,
        injetarJsonDaIA
    }), [
        minhaFicha, meuNome, isMestre, abaAtual,
        nomePoder, descricaoPoder, poderVertente, poderElemento, elementosAfetados,
        imagemUrl, dadosQtd, dadosFaces, custoPercentual, poderAlcance,
        poderArea, armaVinculada, maestriaPoder, fadigaPorUsoPoder, pastaPoder, pastasExistentes, renomearPastaForma,
        nomeEfeito, novoAtr, novoProp, novoVal,
        nomeEfeitoPassivo, novoAtrPassivo, novoPropPassivo, novoValPassivo,
        uploadingImg, vincularAberto, poderPreparandoId, overchargeAtivo,
        addEfeitoTemp, removerEfeitoTemp, addEfeitoPassivoTemp, removerEfeitoPassivoTemp,
        handleImageUpload, salvarNovoPoder, editarPoder, cancelarEdicaoPoder,
        togglePoder, deletarPoder, vincularArmaAoPoder, salvarFormaPoder,
        deletarFormaPoder, ativarFormaPoder,
        armasEquipadas, itensFiltrados, relatorioAuditoria,
        curMana, curAura, curChakra, energiaElemental, mPotencial, danoBruto,
        dispararAtaque, efeitosTemp, efeitosTempPassivos, poderEditandoId, injetarJsonDaIA
    ]);

    return (
        <PoderesFormContext.Provider value={value}>
            {children}
        </PoderesFormContext.Provider>
    );
}