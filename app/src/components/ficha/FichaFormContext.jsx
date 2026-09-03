import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { contarDigitos } from '../../core/utils.js';
import { getMaximo, getBuffs, getEfeitosDeClasse } from '../../core/attributes.js';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from '../../core/vitals.js';
import { salvarFichaSilencioso, salvarFirebaseImediato, uploadImagem } from '../../services/firebase-sync.js';

export const STATS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
export const ENERGIAS = ['mana', 'aura', 'chakra', 'corpo', 'pontosVitais', 'pontosMortais'];

export const ATRIBUTO_OPTIONS = [
    { value: 'forca', label: 'Forca' }, { value: 'destreza', label: 'Destreza' }, { value: 'inteligencia', label: 'Inteligencia' },
    { value: 'sabedoria', label: 'Sabedoria' }, { value: 'energiaEsp', label: 'Energia Espiritual' }, { value: 'carisma', label: 'Carisma' },
    { value: 'stamina', label: 'Stamina' }, { value: 'constituicao', label: 'Constituicao' }, { value: 'vida', label: 'Vida' },
    { value: 'mana', label: 'Mana' }, { value: 'aura', label: 'Aura' }, { value: 'chakra', label: 'Chakra' }, { value: 'corpo', label: 'Corpo' },
    { value: 'pontosVitais', label: 'Pontos Vitais' }, { value: 'pontosMortais', label: 'Pontos Mortais' },
    { value: 'todos_status', label: 'TODOS OS STATUS' }, { value: 'todas_energias', label: 'TODAS AS ENERGIAS' },
    { value: 'geral', label: 'GERAL (Todos)' }, { value: 'dano', label: 'Dano (Apenas Mult)' }, { value: 'especial', label: 'Especial / Mecânica' }
];

export const CLASSES_OPTIONS = [
    { value: '', label: 'Nenhuma / Mundano' }, { value: 'saber', label: '⚔️ Saber' }, { value: 'archer', label: '🏹 Archer' },
    { value: 'lancer', label: '🗡️ Lancer' }, { value: 'rider', label: '🏇 Rider' }, { value: 'caster', label: '🧙‍♂️ Caster' },
    { value: 'assassin', label: '🔪 Assassin' }, { value: 'berserker', label: '狂 Berserker' }, { value: 'shielder', label: '🛡️ Shielder' },
    { value: 'ruler', label: '⚖️ Ruler' }, { value: 'avenger', label: '⛓️ Avenger' }, { value: 'alterego', label: '🎭 Alter Ego' },
    { value: 'foreigner', label: '🐙 Foreigner' }, { value: 'mooncancer', label: '🌕 Moon Cancer' }, { value: 'pretender', label: '🤥 Pretender' },
    { value: 'beast', label: '👹 Beast' }, { value: 'savior', label: '☀️ Savior' }
];

export const CONDICOES_BASE = [
    { id: 'sangrando', icone: '🩸', cor: '#ff003c' }, { id: 'queimado', icone: '🔥', cor: '#ff4400' },
    { id: 'exausto', icone: '😮‍💨', cor: '#aaaaaa' }, { id: 'envenenado', icone: '🤢', cor: '#00ff00' },
    { id: 'criogenia', icone: '❄️', cor: '#00ffff' }, { id: 'lento', icone: '🐢', cor: '#aadd00' },
    { id: 'imobilizado', icone: '⛓️', cor: '#888888' }, { id: 'incapacitado', icone: '☠️', cor: '#444444' },
    { id: 'vulneravel', icone: '🛡️', cor: '#ffaa00' }, { id: 'amedrontado', icone: '👻', cor: '#8a2be2' },
    { id: 'enlouquecido', icone: '🌀', cor: '#ff00ff' }, { id: 'necrosado', icone: '💀', cor: '#222222' },
    { id: 'cegosurdo', icone: '🙈', cor: '#dddddd' }, { id: 'petrificado', icone: '🗿', cor: '#555555' },
    { id: 'charmado', icone: '💖', cor: '#ff66b2' }, { id: 'provocado', icone: '💢', cor: '#ff5500' }
];

export const ELEMENTOS_BASE = [
    { id: 'fisico', nome: 'Cinético', icone: '⚔️', cor: '#cccccc' }, { id: 'fogo', nome: 'Fogo', icone: '🔥', cor: '#ff4444' },
    { id: 'agua', nome: 'Água', icone: '💧', cor: '#0088ff' }, { id: 'raio', nome: 'Raio', icone: '⚡', cor: '#ffcc00' },
    { id: 'gelo', nome: 'Gelo', icone: '❄️', cor: '#00ffff' }, { id: 'luz', nome: 'Luz', icone: '☀️', cor: '#fffbd6' },
    { id: 'trevas', nome: 'Trevas', icone: '🌑', cor: '#8800ff' }
];

const FichaFormContext = createContext(null);

export function useFichaForm() {
    return useContext(FichaFormContext);
}

export function FichaFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const personagens = useStore(s => s.personagens);
    const meuNome = useStore(s => s.meuNome);

    const [mesa, setMesa] = useState('presente'); 
    const [raca, setRaca] = useState('');
    const [classe, setClasse] = useState('');
    const [subClasse, setSubClasse] = useState(''); 
    const [alterEgoSlot1, setAlterEgoSlot1] = useState('');
    const [alterEgoSerId, setAlterEgoSerId] = useState(''); 
    const [classesMemorizadas, setClassesMemorizadas] = useState([]); 
    const [idade, setIdade] = useState('');
    const [fisico, setFisico] = useState('');
    const [sangue, setSangue] = useState('');
    const [alinhamento, setAlinhamento] = useState('');
    const [afiliacao, setAfiliacao] = useState('');
    const [dinheiro, setDinheiro] = useState('');
    const [salvandoBio, setSalvandoBio] = useState(false);
    
    const seresSelados = minhaFicha?.seresSelados || [];
    const [serNome, setSerNome] = useState('');
    const [serDescricao, setSerDescricao] = useState('');
    const [serElemento, setSerElemento] = useState('');
    const [serClasse, setSerClasse] = useState('');
    const [serZeraCusto, setSerZeraCusto] = useState(false);
    const [serEditandoId, setSerEditandoId] = useState(null);
    
    const [serEfeitos, setSerEfeitos] = useState([]);
    const [serEfeitosPassivos, setSerEfeitosPassivos] = useState([]);

    const [serNovoNomeEfeito, setSerNovoNomeEfeito] = useState('');
    const [serNovoAtr, setSerNovoAtr] = useState('forca');
    const [serNovoProp, setSerNovoProp] = useState('base');
    const [serNovoVal, setSerNovoVal] = useState('');

    const [serNovoNomeEfeitoPassivo, setSerNovoNomeEfeitoPassivo] = useState('');
    const [serNovoAtrPassivo, setSerNovoAtrPassivo] = useState('forca');
    const [serNovoPropPassivo, setSerNovoPropPassivo] = useState('base');
    const [serNovoValPassivo, setSerNovoValPassivo] = useState('');

    const modificarCondicao = useCallback((condId, delta) => {
        updateFicha(f => {
            if (!f.condicoes) f.condicoes = [];
            const index = f.condicoes.findIndex(c => c.id === condId);
            if (index > -1) {
                f.condicoes[index].stacks += delta;
                if (f.condicoes[index].stacks <= 0) f.condicoes.splice(index, 1);
                else if (f.condicoes[index].stacks > 6) f.condicoes[index].stacks = 6; 
            } else if (delta > 0) {
                f.condicoes.push({ id: condId, stacks: 1 });
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const toggleAfinidade = useCallback((categoria, elementoId) => {
        updateFicha(f => {
            if (!f.afinidades) f.afinidades = { resistencias: [], vulnerabilidades: [], imunidades: [], absorcoes: [] };
            const lista = f.afinidades[categoria] || [];
            if (lista.includes(elementoId)) {
                f.afinidades[categoria] = lista.filter(e => e !== elementoId);
            } else {
                Object.keys(f.afinidades).forEach(cat => {
                    f.afinidades[cat] = (f.afinidades[cat] || []).filter(e => e !== elementoId);
                });
                f.afinidades[categoria].push(elementoId);
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const overridesCompendio = useMemo(() => {
        let globais = { classes: {}, grands: {}, condicoes: {}, elementos: {}, regras: {} };
        if (personagens) {
            Object.values(personagens).forEach(p => {
                if (p && p.compendioOverrides) {
                    if (p.compendioOverrides.classes) Object.assign(globais.classes, p.compendioOverrides.classes);
                    if (p.compendioOverrides.grands) Object.assign(globais.grands, p.compendioOverrides.grands);
                    if (p.compendioOverrides.condicoes) Object.assign(globais.condicoes, p.compendioOverrides.condicoes);
                    if (p.compendioOverrides.elementos) Object.assign(globais.elementos, p.compendioOverrides.elementos);
                    if (p.compendioOverrides.regras) Object.assign(globais.regras, p.compendioOverrides.regras);
                }
            });
        }
        if (minhaFicha && minhaFicha.compendioOverrides) {
            if (minhaFicha.compendioOverrides.classes) Object.assign(globais.classes, minhaFicha.compendioOverrides.classes);
            if (minhaFicha.compendioOverrides.grands) Object.assign(globais.grands, minhaFicha.compendioOverrides.grands);
            if (minhaFicha.compendioOverrides.condicoes) Object.assign(globais.condicoes, minhaFicha.compendioOverrides.condicoes);
            if (minhaFicha.compendioOverrides.elementos) Object.assign(globais.elementos, minhaFicha.compendioOverrides.elementos);
            if (minhaFicha.compendioOverrides.regras) Object.assign(globais.regras, minhaFicha.compendioOverrides.regras);
        }
        return globais;
    }, [minhaFicha, personagens]);

    const mesclarComOverrides = useCallback((baseArray, tipo) => {
        const overridesObj = overridesCompendio[tipo] || {};
        const map = {};
        baseArray.forEach(item => map[item.id] = { ...item });
        Object.keys(overridesObj).forEach(k => {
            if (overridesObj[k].deletado) delete map[k];
            else if (map[k]) map[k] = { ...map[k], ...overridesObj[k] };
            else map[k] = overridesObj[k];
        });
        return Object.values(map);
    }, [overridesCompendio]);

    const condicoesDinamicas = useMemo(() => mesclarComOverrides(CONDICOES_BASE, 'condicoes'), [mesclarComOverrides]);
    const elementosDinamicos = useMemo(() => mesclarComOverrides(ELEMENTOS_BASE, 'elementos'), [mesclarComOverrides]);

    const grands = overridesCompendio.grands || {};
    const isGrand = classe && grands[`${classe}_${mesa}`] === meuNome;
    const grandIcone = isGrand ? grands[`${classe}_${mesa}_icone`] : null;

    const carregarBio = useCallback(() => {
        const bio = minhaFicha?.bio || {};
        setMesa(bio.mesa || 'presente'); setRaca(bio.raca || ''); setClasse(bio.classe || '');
        setSubClasse(bio.subClasse || ''); setAlterEgoSlot1(bio.alterEgoSlot1 || ''); setAlterEgoSerId(bio.alterEgoSerId || '');
        setClassesMemorizadas(bio.classesMemorizadas || []); setIdade(bio.idade || ''); setFisico(bio.fisico || '');
        setSangue(bio.sangue || ''); setAlinhamento(bio.alinhamento || ''); setAfiliacao(bio.afiliacao || ''); setDinheiro(bio.dinheiro || '');
    }, [minhaFicha?.bio]);

    useEffect(() => { carregarBio(); }, [carregarBio]);

    const comitarBio = useCallback((overrides = {}) => {
        updateFicha((ficha) => {
            if (!ficha.bio) ficha.bio = {};
            ficha.bio.mesa = overrides.mesa !== undefined ? overrides.mesa : mesa;
            ficha.bio.raca = overrides.raca !== undefined ? overrides.raca : raca;
            ficha.bio.classe = overrides.classe !== undefined ? overrides.classe : classe;
            ficha.bio.subClasse = overrides.subClasse !== undefined ? overrides.subClasse : subClasse; 
            ficha.bio.alterEgoSlot1 = overrides.alterEgoSlot1 !== undefined ? overrides.alterEgoSlot1 : alterEgoSlot1;
            ficha.bio.alterEgoSerId = overrides.alterEgoSerId !== undefined ? overrides.alterEgoSerId : alterEgoSerId;
            ficha.bio.classesMemorizadas = overrides.classesMemorizadas !== undefined ? overrides.classesMemorizadas : classesMemorizadas; 
            ficha.bio.idade = overrides.idade !== undefined ? overrides.idade : idade;
            ficha.bio.fisico = overrides.fisico !== undefined ? overrides.fisico : fisico;
            ficha.bio.sangue = overrides.sangue !== undefined ? overrides.sangue : sangue;
            ficha.bio.alinhamento = overrides.alinhamento !== undefined ? overrides.alinhamento : alinhamento;
            ficha.bio.afiliacao = overrides.afiliacao !== undefined ? overrides.afiliacao : afiliacao;
            ficha.bio.dinheiro = overrides.dinheiro !== undefined ? overrides.dinheiro : dinheiro;
        });
        salvarFichaSilencioso();
    }, [updateFicha, mesa, raca, classe, subClasse, alterEgoSlot1, alterEgoSerId, classesMemorizadas, idade, fisico, sangue, alinhamento, afiliacao, dinheiro]);

    const salvarBio = useCallback(() => { comitarBio(); setSalvandoBio(true); setTimeout(() => setSalvandoBio(false), 2000); }, [comitarBio]);
    const mudarSubClasseDireto = useCallback((novaSub) => { setSubClasse(novaSub); comitarBio({ subClasse: novaSub }); }, [comitarBio]);

    let multiplicadorFuriaClasse = 0;
    const scanFuria = (efs) => {
        if (!efs) return;
        efs.forEach(e => {
            if (!e) return;
            let p = (e.propriedade || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (p === 'furia_berserker') { let v = parseFloat(e.valor) || 0; if (v > multiplicadorFuriaClasse) multiplicadorFuriaClasse = v; }
        });
    };

    if (minhaFicha) {
        (minhaFicha.poderes || []).forEach(p => { if (p && p.ativa) scanFuria(p.efeitos); scanFuria(p.efeitosPassivos); });
        (minhaFicha.inventario || []).forEach(i => { if (i && i.equipado) { scanFuria(i.efeitos); scanFuria(i.efeitosPassivos); } });
        (minhaFicha.passivas || []).forEach(p => scanFuria(p.efeitos));
        (minhaFicha.seresSelados || []).forEach(s => { 
            if (s && s.ativo) { 
                scanFuria(s.efeitos); scanFuria(s.efeitosPassivos);
                if (s.formaAtivaId && s.formas) {
                    const frm = s.formas.find(f => f.id === s.formaAtivaId);
                    if (frm) { scanFuria(frm.efeitos); scanFuria(frm.efeitosPassivos); }
                }
            }
        });
        scanFuria(getEfeitosDeClasse(minhaFicha));
    }

    const rawMaxVida = minhaFicha ? getMaximo(minhaFicha, 'vida', true) : 1;
    const strVal = String(Math.floor(rawMaxVida));
    const pVit = Math.max(0, strVal.length - 8);
    const maxVida = pVit > 0 ? Math.floor(rawMaxVida / Math.pow(10, pVit)) : rawMaxVida;
    const atualVida = minhaFicha?.vida?.atual ?? maxVida;
    const percAtualLostFloor = Math.floor(maxVida > 0 ? Math.max(0, ((maxVida - atualVida) / maxVida) * 100) : 0);
    const furiaMax = minhaFicha?.combate?.furiaMax || 0;
    const percEfetivoParaDisplay = Math.max(percAtualLostFloor, furiaMax);

    let multiplicadorFuriaVisor = 0;
    if (percEfetivoParaDisplay === 1) multiplicadorFuriaVisor = multiplicadorFuriaClasse;
    else if (percEfetivoParaDisplay >= 2) multiplicadorFuriaVisor = percEfetivoParaDisplay;

    useEffect(() => {
        if (multiplicadorFuriaClasse > 0 && percAtualLostFloor > furiaMax) {
            updateFicha(f => { if (!f.combate) f.combate = {}; f.combate.furiaMax = percAtualLostFloor; });
            salvarFichaSilencioso();
        }
    }, [percAtualLostFloor, furiaMax, multiplicadorFuriaClasse, updateFicha]);

    const [furiaAcalmadaMsg, setFuriaAcalmadaMsg] = useState(false);
    const acalmarFuria = useCallback((e) => {
        if (e) e.preventDefault();
        updateFicha(f => { if (!f.combate) f.combate = {}; f.combate.furiaMax = percAtualLostFloor; });
        salvarFichaSilencioso(); setFuriaAcalmadaMsg(true); setTimeout(() => setFuriaAcalmadaMsg(false), 2000);
    }, [updateFicha, percAtualLostFloor]);

    const toggleMemoriaPretender = useCallback((val) => {
        setClassesMemorizadas(prev => {
            const isRemoving = prev.includes(val);
            const novaLista = isRemoving ? prev.filter(v => v !== val) : [...prev, val];
            if (isRemoving && subClasse === val) { setSubClasse(''); comitarBio({ classesMemorizadas: novaLista, subClasse: '' }); } 
            else { comitarBio({ classesMemorizadas: novaLista }); }
            return novaLista;
        });
    }, [subClasse, comitarBio]);

    const descansoLongoPretender = useCallback((e) => {
        if (e) e.preventDefault();
        if (window.confirm('O Descanso Longo vai apagar todas as memórias de classe do Pretender e remover o seu Disfarce atual. Confirmar?')) {
            setClassesMemorizadas([]); setSubClasse(''); comitarBio({ classesMemorizadas: [], subClasse: '' });
        }
    }, [comitarBio]);

    const [selAtributo, setSelAtributo] = useState('forca');
    const [campos, setCampos] = useState({ base: 0, mBase: 1, regeneracao: 0 });

    const carregarAtributoNaTela = useCallback(() => {
        const s = selAtributo;
        const k = (s === 'todos_status') ? 'forca' : (s === 'todas_energias') ? 'mana' : s;
        if (!minhaFicha || !minhaFicha[k]) { setCampos({ base: 0, mBase: 1, regeneracao: 0 }); return; }
        const st = minhaFicha[k];
        setCampos({ base: st.base || 0, mBase: st.mBase || 1, regeneracao: st.regeneracao || 0 });
    }, [selAtributo, minhaFicha]);

    useEffect(() => { carregarAtributoNaTela(); }, [carregarAtributoNaTela]);

    const salvarAtributo = useCallback(() => {
        const s = selAtributo;
        let chs = [];
        if (s === 'todos_status') chs = [...STATS];
        else if (s === 'todas_energias') chs = [...ENERGIAS];
        else chs = [s];
        const v = { b: parseInt(campos.base) || 0, mb: parseFloat(campos.mBase) || 1, rg: parseFloat(campos.regeneracao) || 0 };
        updateFicha((ficha) => {
            for (let i = 0; i < chs.length; i++) {
                const c = chs[i];
                if (!ficha[c]) ficha[c] = {}; 
                ficha[c].base = v.b; ficha[c].mBase = v.mb; ficha[c].regeneracao = v.rg;
                if (['vida', 'mana', 'aura', 'chakra', 'corpo', 'pontosVitais', 'pontosMortais'].includes(c)) {
                    let mx = getMaximo(ficha, c);
                    if (c === 'vida') { const p = Math.max(0, contarDigitos(mx) - 8); if (p > 0) mx = Math.floor(mx / Math.pow(10, p)); } 
                    else { const p = Math.max(0, contarDigitos(mx) - 9); if (p > 0) mx = Math.floor(mx / Math.pow(10, p)); }
                    ficha[c].atual = mx;
                }
            }
        });
        salvarFichaSilencioso(); alert('Salvo!');
    }, [selAtributo, campos, updateFicha]);

    const [dmBase, setDmBase] = useState(1.0); const [dmPotencial, setDmPotencial] = useState(1.0); const [dmGeral, setDmGeral] = useState(1.0);
    const [dmFormas, setDmFormas] = useState(1.0); const [dmAbsoluto, setDmAbsoluto] = useState(1.0); const [dmUnico, setDmUnico] = useState('1.0');
    const [danoBruto, setDanoBruto] = useState(0); const [salvandoMult, setSalvandoMult] = useState(false);

    useEffect(() => {
        const d = minhaFicha?.dano || {};
        setDmBase(d.mBase ?? 1.0); setDmPotencial(d.mPotencial ?? 1.0); setDmGeral(d.mGeral ?? 1.0);
        setDmFormas(d.mFormas ?? 1.0); setDmAbsoluto(d.mAbsoluto ?? 1.0); setDmUnico(d.mUnico ?? '1.0');
        setDanoBruto(d.danoBruto ?? 0); 
    }, [minhaFicha?.dano]);

    const buffsDano = minhaFicha ? getBuffs(minhaFicha, 'dano') : { _hasBuff: {}, munico: [], fontesMgeral: [] };

    const salvarMultiplicadores = useCallback(() => {
        updateFicha((ficha) => {
            if (!ficha.dano) ficha.dano = {};
            ficha.dano.mBase = parseFloat(dmBase) || 1.0; ficha.dano.mPotencial = parseFloat(dmPotencial) || 1.0; ficha.dano.mGeral = parseFloat(dmGeral) || 1.0;
            ficha.dano.mFormas = parseFloat(dmFormas) || 1.0; ficha.dano.mAbsoluto = parseFloat(dmAbsoluto) || 1.0; ficha.dano.mUnico = dmUnico || '1.0';
            ficha.dano.danoBruto = parseFloat(danoBruto) || 0; 
        });
        salvarFichaSilencioso(); setSalvandoMult(true); setTimeout(() => setSalvandoMult(false), 2000);
    }, [dmBase, dmPotencial, dmGeral, dmFormas, dmAbsoluto, dmUnico, danoBruto, updateFicha]);

    const handleCampo = useCallback((field, val) => { setCampos(prev => ({ ...prev, [field]: val })); }, []);

    const sKeyForBuffs = (selAtributo === 'todos_status') ? 'forca' : (selAtributo === 'todas_energias') ? 'mana' : selAtributo;
    const buffsAtuais = minhaFicha ? getBuffs(minhaFicha, sKeyForBuffs) : null;

    const addSerEfeito = useCallback(() => {
        if (!serNovoVal || !serNovoNomeEfeito.trim()) { alert('Preencha o nome e o valor do efeito!'); return; }
        setSerEfeitos([...serEfeitos, { nome: serNovoNomeEfeito.trim(), atributo: serNovoAtr, propriedade: serNovoProp, valor: serNovoVal }]);
        setSerNovoVal(''); setSerNovoNomeEfeito('');
    }, [serNovoVal, serNovoNomeEfeito, serNovoAtr, serNovoProp, serEfeitos]);

    const removeSerEfeito = useCallback((index) => { setSerEfeitos(serEfeitos.filter((_, i) => i !== index)); }, [serEfeitos]);

    const addSerEfeitoPassivo = useCallback(() => {
        if (!serNovoValPassivo || !serNovoNomeEfeitoPassivo.trim()) { alert('Preencha o nome e o valor do passivo!'); return; }
        setSerEfeitosPassivos([...serEfeitosPassivos, { nome: serNovoNomeEfeitoPassivo.trim(), atributo: serNovoAtrPassivo, propriedade: serNovoPropPassivo, valor: serNovoValPassivo }]);
        setSerNovoValPassivo(''); setSerNovoNomeEfeitoPassivo('');
    }, [serNovoValPassivo, serNovoNomeEfeitoPassivo, serNovoAtrPassivo, serNovoPropPassivo, serEfeitosPassivos]);

    const removeSerEfeitoPassivo = useCallback((index) => { setSerEfeitosPassivos(serEfeitosPassivos.filter((_, i) => i !== index)); }, [serEfeitosPassivos]);

    const cancelarEdicaoSer = useCallback(() => {
        setSerEditandoId(null); setSerNome(''); setSerDescricao(''); setSerElemento(''); setSerClasse(''); setSerZeraCusto(false);
        setSerEfeitos([]); setSerEfeitosPassivos([]);
    }, []);

    const addSerSelado = useCallback(() => {
        if (!serNome.trim()) return;
        updateFicha(f => {
            if (!f.seresSelados) f.seresSelados = [];
            if (serEditandoId) {
                const s = f.seresSelados.find(x => x.id === serEditandoId);
                if (s) { 
                    s.nome = serNome; s.descricao = serDescricao; s.elemento = serElemento; s.classe = serClasse; s.zeraCusto = serZeraCusto;
                    s.efeitos = [...serEfeitos]; s.efeitosPassivos = [...serEfeitosPassivos];
                }
            } else {
                f.seresSelados.push({ 
                    id: Date.now().toString(), nome: serNome, descricao: serDescricao, elemento: serElemento, classe: serClasse, zeraCusto: serZeraCusto, ativo: false,
                    efeitos: [...serEfeitos], efeitosPassivos: [...serEfeitosPassivos], formas: [], formaAtivaId: null
                });
            }
        });
        salvarFichaSilencioso(); cancelarEdicaoSer();
    }, [serNome, serDescricao, serElemento, serClasse, serZeraCusto, serEfeitos, serEfeitosPassivos, serEditandoId, updateFicha, cancelarEdicaoSer]);

    const editarSerSelado = useCallback((id) => {
        const s = (minhaFicha?.seresSelados || []).find(x => x.id === id);
        if (!s) return;
        if (s.ativo) { alert("Desative a sincronização do Ser antes de editá-lo!"); return; }
        setSerEditandoId(s.id); setSerNome(s.nome); setSerDescricao(s.descricao || ''); setSerElemento(s.elemento || ''); setSerClasse(s.classe || ''); setSerZeraCusto(s.zeraCusto || false);
        setSerEfeitos([...(s.efeitos || [])]); setSerEfeitosPassivos([...(s.efeitosPassivos || [])]);
    }, [minhaFicha]);

    const removeSerSelado = useCallback((id) => {
        if(!window.confirm('Tem certeza que deseja exilar esta entidade e quebrar o pacto?')) return;
        updateFicha(f => {
            if (!f.seresSelados) return;
            const oldM = capturarMaximosAtuais(f);
            f.seresSelados = f.seresSelados.filter(x => x.id !== id);
            rescalarVitaisProporcional(f, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const toggleSerSelado = useCallback((id) => {
        updateFicha(f => {
            if (!f.seresSelados) return;
            const s = f.seresSelados.find(x => x.id === id);
            if (!s) return;
            const oldM = capturarMaximosAtuais(f);
            s.ativo = !s.ativo;
            rescalarVitaisProporcional(f, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const salvarFormaSer = useCallback((serId, forma) => {
        updateFicha(f => {
            const s = (f.seresSelados || []).find(x => x.id === serId);
            if (!s) return;
            if (!s.formas) s.formas = [];
            const ix = s.formas.findIndex(x => x.id === forma.id);
            if (ix >= 0) s.formas[ix] = forma; else s.formas.push(forma);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const deletarFormaSer = useCallback((serId, formaId) => {
        if (!window.confirm("Deseja apagar esta forma/modo do Ser Selado?")) return;
        updateFicha(f => {
            const s = (f.seresSelados || []).find(x => x.id === serId);
            if (!s || !s.formas) return;
            const oldM = capturarMaximosAtuais(f);
            s.formas = s.formas.filter(x => x.id !== formaId);
            if (s.formaAtivaId === formaId) s.formaAtivaId = null;
            rescalarVitaisProporcional(f, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const ativarFormaSer = useCallback((serId, formaId) => {
        updateFicha(f => {
            const s = (f.seresSelados || []).find(x => x.id === serId);
            if (!s) return;
            const oldM = capturarMaximosAtuais(f);
            s.formaAtivaId = s.formaAtivaId === formaId ? null : formaId;
            if (s.formaAtivaId && !s.ativo) s.ativo = true;
            rescalarVitaisProporcional(f, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const value = useMemo(() => ({
        minhaFicha, updateFicha, personagens, meuNome,
        mesa, setMesa, raca, setRaca, classe, setClasse, subClasse, setSubClasse,
        alterEgoSlot1, setAlterEgoSlot1, alterEgoSerId, setAlterEgoSerId, classesMemorizadas, setClassesMemorizadas,
        idade, setIdade, fisico, setFisico, sangue, setSangue, alinhamento, setAlinhamento,
        afiliacao, setAfiliacao, dinheiro, setDinheiro, salvandoBio,
        overridesCompendio, grands, isGrand, grandIcone, comitarBio, salvarBio, mudarSubClasseDireto,
        multiplicadorFuriaClasse, rawMaxVida, maxVida, atualVida, percAtualLostFloor, furiaMax, percEfetivoParaDisplay,
        multiplicadorFuriaVisor, furiaAcalmadaMsg, acalmarFuria, toggleMemoriaPretender, descansoLongoPretender,
        selAtributo, setSelAtributo, campos, setCampos, handleCampo, carregarAtributoNaTela, salvarAtributo,
        dmBase, setDmBase, dmPotencial, setDmPotencial, dmGeral, setDmGeral,
        dmFormas, setDmFormas, dmAbsoluto, setDmAbsoluto, dmUnico, setDmUnico,
        danoBruto, setDanoBruto, salvandoMult, salvarMultiplicadores,
        buffsDano, sKeyForBuffs, buffsAtuais,
        seresSelados, serNome, setSerNome, serDescricao, setSerDescricao,
        serElemento, setSerElemento, serClasse, setSerClasse, serEditandoId, serZeraCusto, setSerZeraCusto,
        serEfeitos, serEfeitosPassivos, serNovoNomeEfeito, setSerNovoNomeEfeito, 
        serNovoAtr, setSerNovoAtr, serNovoProp, setSerNovoProp, serNovoVal, setSerNovoVal,
        serNovoNomeEfeitoPassivo, setSerNovoNomeEfeitoPassivo, 
        serNovoAtrPassivo, setSerNovoAtrPassivo, serNovoPropPassivo, setSerNovoPropPassivo, serNovoValPassivo, setSerNovoValPassivo,
        addSerEfeito, removeSerEfeito, addSerEfeitoPassivo, removeSerEfeitoPassivo,
        addSerSelado, editarSerSelado, removeSerSelado, toggleSerSelado, cancelarEdicaoSer,
        salvarFormaSer, deletarFormaSer, ativarFormaSer,
        modificarCondicao, toggleAfinidade, condicoesDinamicas, elementosDinamicos
    }), [
        minhaFicha, updateFicha, personagens, meuNome, mesa, raca, classe, subClasse, alterEgoSlot1, alterEgoSerId, classesMemorizadas,
        idade, fisico, sangue, alinhamento, afiliacao, dinheiro, salvandoBio, overridesCompendio, grands, isGrand, grandIcone,
        comitarBio, salvarBio, mudarSubClasseDireto, multiplicadorFuriaClasse, rawMaxVida, maxVida, atualVida, percAtualLostFloor, furiaMax, percEfetivoParaDisplay,
        multiplicadorFuriaVisor, furiaAcalmadaMsg, acalmarFuria, toggleMemoriaPretender, descansoLongoPretender, selAtributo, campos, handleCampo, carregarAtributoNaTela, salvarAtributo,
        dmBase, dmPotencial, dmGeral, dmFormas, dmAbsoluto, dmUnico, danoBruto, salvandoMult, salvarMultiplicadores, buffsDano, sKeyForBuffs, buffsAtuais,
        seresSelados, serNome, serDescricao, serElemento, serClasse, serEditandoId, serZeraCusto,
        serEfeitos, serEfeitosPassivos, serNovoNomeEfeito, serNovoAtr, serNovoProp, serNovoVal,
        serNovoNomeEfeitoPassivo, serNovoAtrPassivo, serNovoPropPassivo, serNovoValPassivo,
        addSerEfeito, removeSerEfeito, addSerEfeitoPassivo, removeSerEfeitoPassivo,
        addSerSelado, editarSerSelado, removeSerSelado, toggleSerSelado, cancelarEdicaoSer,
        salvarFormaSer, deletarFormaSer, ativarFormaSer, modificarCondicao, toggleAfinidade, condicoesDinamicas, elementosDinamicos
    ]);

    return (
        <FichaFormContext.Provider value={value}>
            {children}
        </FichaFormContext.Provider>
    );
}