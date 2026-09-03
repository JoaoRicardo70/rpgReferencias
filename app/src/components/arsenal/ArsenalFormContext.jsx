import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from '../../core/vitals';

export const ARMA_TIPOS = ['espada', 'arco', 'lança', 'machado', 'adaga', 'cajado', 'arma de fogo', 'manopla', 'foice', 'chicote', 'martelo', 'escudo'];
export const RARIDADES = ['comum', 'rara', 'avançada', 'lendaria', 'lendaria (Longuinus)', 'espiritual', 'fantasma nobre'];

export const BONUS_OPTIONS = [
    { value: 'mult_dano', label: 'Mult Dano' },
    { value: 'dano_bruto', label: 'Dano Bruto' },
    { value: 'letalidade', label: 'Letalidade' },
    { value: 'bonus_acerto', label: 'Bonus Acerto' },
    { value: 'bonus_evasiva', label: 'Bonus Evasiva' },
    { value: 'bonus_resistencia', label: 'Bonus Resistencia' },
    { value: 'mult_escudo', label: 'Mult Escudo' },
];

const ArsenalFormContext = createContext(null);

export function useArsenalForm() {
    const ctx = useContext(ArsenalFormContext);
    if (!ctx) return null;
    return ctx;
}

export function ArsenalFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const itemEditandoId = useStore(s => s.itemEditandoId);
    const setItemEditandoId = useStore(s => s.setItemEditandoId);
    const efeitosTempArsenal = useStore(s => s.efeitosTempArsenal);
    const setEfeitosTempArsenal = useStore(s => s.setEfeitosTempArsenal);
    const efeitosTempPassivosArsenal = useStore(s => s.efeitosTempPassivosArsenal);
    const setEfeitosTempPassivosArsenal = useStore(s => s.setEfeitosTempPassivosArsenal);

    const [nomeItem, setNomeItem] = useState('');
    const [tipoItem, setTipoItem] = useState('arma');
    const [bonusTipo, setBonusTipo] = useState('mult_dano');
    const [bonusValor, setBonusValor] = useState('');
    const [armaDadosQtd, setArmaDadosQtd] = useState(1);
    const [armaDadosFaces, setArmaDadosFaces] = useState(20);
    const [armaAlcance, setArmaAlcance] = useState(1);
    const [armaTipo, setArmaTipo] = useState('espada');
    const [raridade, setRaridade] = useState('comum');

    const [nomeEfeito, setNomeEfeito] = useState('');
    const [novoAtr, setNovoAtr] = useState('forca');
    const [novoProp, setNovoProp] = useState('base');
    const [novoVal, setNovoVal] = useState('');
    const [nomeEfeitoPassivo, setNomeEfeitoPassivo] = useState('');
    const [novoAtrPassivo, setNovoAtrPassivo] = useState('forca');
    const [novoPropPassivo, setNovoPropPassivo] = useState('base');
    const [novoValPassivo, setNovoValPassivo] = useState('');

    const formRef = useRef(null);

    const addEfeitoTemp = useCallback(() => {
        if (!novoVal || !nomeEfeito.trim()) { alert('Preencha o nome e o valor do efeito!'); return; }
        setEfeitosTempArsenal([...efeitosTempArsenal, { nome: nomeEfeito.trim(), atributo: novoAtr, propriedade: novoProp, valor: novoVal }]);
        setNovoVal('');
        setNomeEfeito('');
    }, [novoVal, nomeEfeito, efeitosTempArsenal, novoAtr, novoProp, setEfeitosTempArsenal]);

    const removerEfeitoTemp = useCallback((index) => {
        setEfeitosTempArsenal(efeitosTempArsenal.filter((_, i) => i !== index));
    }, [efeitosTempArsenal, setEfeitosTempArsenal]);

    const addEfeitoPassivoTemp = useCallback(() => {
        if (!novoValPassivo || !nomeEfeitoPassivo.trim()) { alert('Preencha o nome e o valor do efeito passivo!'); return; }
        setEfeitosTempPassivosArsenal([...efeitosTempPassivosArsenal, { nome: nomeEfeitoPassivo.trim(), atributo: novoAtrPassivo, propriedade: novoPropPassivo, valor: novoValPassivo }]);
        setNovoValPassivo('');
        setNomeEfeitoPassivo('');
    }, [novoValPassivo, nomeEfeitoPassivo, efeitosTempPassivosArsenal, novoAtrPassivo, novoPropPassivo, setEfeitosTempPassivosArsenal]);

    const removerEfeitoPassivoTemp = useCallback((index) => {
        setEfeitosTempPassivosArsenal(efeitosTempPassivosArsenal.filter((_, i) => i !== index));
    }, [efeitosTempPassivosArsenal, setEfeitosTempPassivosArsenal]);

    const cancelarEdicaoItem = useCallback(() => {
        setItemEditandoId(null);
        setNomeItem('');
        setTipoItem('arma');
        setBonusTipo('mult_dano');
        setBonusValor('');
        setArmaDadosQtd(1);
        setArmaDadosFaces(20);
        setArmaAlcance(1);
        setArmaTipo('espada');
        setRaridade('comum');
        setEfeitosTempArsenal([]);
        setEfeitosTempPassivosArsenal([]);
    }, [setItemEditandoId, setEfeitosTempArsenal, setEfeitosTempPassivosArsenal]);

    const toggleEquiparItem = useCallback((id) => {
        updateFicha((ficha) => {
            if (!ficha.inventario) return;
            const itemIndex = ficha.inventario.findIndex(i => i.id === id);
            if (itemIndex === -1) return;

            const oldM = capturarMaximosAtuais(ficha);

            const itemToEquip = ficha.inventario[itemIndex];
            if (!itemToEquip.equipado && (itemToEquip.tipo === 'arma' || itemToEquip.tipo === 'armadura')) {
                ficha.inventario.forEach(i => {
                    if (i.tipo === itemToEquip.tipo && i.equipado) i.equipado = false;
                });
            }
            ficha.inventario[itemIndex].equipado = !ficha.inventario[itemIndex].equipado;

            if (!ficha.inventario[itemIndex].equipado) {
                ficha.inventario[itemIndex].formaAtivaId = null;
                ficha.inventario[itemIndex].configAtivaId = null;
            }

            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const salvarNovoItem = useCallback(() => {
        const n = nomeItem.trim();
        if (!n) { alert('Falta o nome do Equipamento!'); return; }

        const inventarioAtual = minhaFicha?.inventario || [];
        let deveLimparEfeitos = true;
        if (itemEditandoId && tipoItem !== 'arma') {
            const itemExistente = inventarioAtual.find(i => i.id === itemEditandoId);
            if (itemExistente) {
                const tinhaEfeitos = (itemExistente.efeitos || []).length > 0 || (itemExistente.efeitosPassivos || []).length > 0;
                if (tinhaEfeitos && !window.confirm('Este item tinha efeitos de arma. Mudar o tipo vai remover todos os efeitos. Continuar?')) {
                    deveLimparEfeitos = false;
                }
            }
        }

        updateFicha((ficha) => {
            if (!ficha.inventario) ficha.inventario = [];

            if (itemEditandoId) {
                const ix = ficha.inventario.findIndex(i => i.id === itemEditandoId);
                if (ix !== -1) {
                    ficha.inventario[ix].nome = n;
                    ficha.inventario[ix].tipo = tipoItem;
                    ficha.inventario[ix].elemento = 'Neutro';
                    ficha.inventario[ix].bonusTipo = bonusTipo;
                    ficha.inventario[ix].bonusValor = bonusValor;
                    ficha.inventario[ix].armaTipo = tipoItem === 'arma' ? armaTipo : '';
                    ficha.inventario[ix].raridade = raridade;
                    if (tipoItem === 'arma') {
                        ficha.inventario[ix].dadosQtd = parseInt(armaDadosQtd) || 1;
                        ficha.inventario[ix].dadosFaces = parseInt(armaDadosFaces) || 20;
                        ficha.inventario[ix].alcance = parseFloat(armaAlcance) || 1;
                        ficha.inventario[ix].efeitos = JSON.parse(JSON.stringify(efeitosTempArsenal));
                        ficha.inventario[ix].efeitosPassivos = JSON.parse(JSON.stringify(efeitosTempPassivosArsenal));
                    } else if (deveLimparEfeitos) {
                        ficha.inventario[ix].efeitos = [];
                        ficha.inventario[ix].efeitosPassivos = [];
                    }
                }
            } else {
                ficha.inventario.push({
                    id: Date.now(),
                    nome: n,
                    tipo: tipoItem,
                    elemento: 'Neutro',
                    bonusTipo: bonusTipo,
                    bonusValor: bonusValor,
                    armaTipo: tipoItem === 'arma' ? armaTipo : '',
                    raridade: raridade,
                    dadosQtd: tipoItem === 'arma' ? (parseInt(armaDadosQtd) || 1) : 0,
                    dadosFaces: tipoItem === 'arma' ? (parseInt(armaDadosFaces) || 20) : 0,
                    alcance: tipoItem === 'arma' ? (parseFloat(armaAlcance) || 1) : 0,
                    efeitos: tipoItem === 'arma' ? JSON.parse(JSON.stringify(efeitosTempArsenal)) : [],
                    efeitosPassivos: tipoItem === 'arma' ? JSON.parse(JSON.stringify(efeitosTempPassivosArsenal)) : [],
                    equipado: false
                });
            }
        });

        cancelarEdicaoItem();
        setNomeItem('');
        setBonusValor('');
        salvarFichaSilencioso();
    }, [nomeItem, minhaFicha, itemEditandoId, tipoItem, bonusTipo, bonusValor, armaTipo, raridade, armaDadosQtd, armaDadosFaces, armaAlcance, efeitosTempArsenal, efeitosTempPassivosArsenal, updateFicha, cancelarEdicaoItem]);

    const editarItem = useCallback((id) => {
        const p = (minhaFicha?.inventario || []).find(i => i.id === id);
        if (!p) return;
        if (p.equipado) {
            toggleEquiparItem(id);
            alert(`O item [${p.nome}] foi DESEQUIPADO para edicao.`);
        }

        setItemEditandoId(p.id);
        setNomeItem(p.nome);
        setTipoItem(p.tipo);
        setBonusTipo(p.bonusTipo);
        setBonusValor(p.bonusValor);
        setArmaDadosQtd(p.dadosQtd || 1);
        setArmaDadosFaces(p.dadosFaces || 20);
        setArmaAlcance(p.alcance || 1);
        setArmaTipo(p.armaTipo || 'espada');
        setRaridade(p.raridade || 'comum');
        setEfeitosTempArsenal(JSON.parse(JSON.stringify(p.efeitos || [])));
        setEfeitosTempPassivosArsenal(JSON.parse(JSON.stringify(p.efeitosPassivos || [])));
        if (formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [minhaFicha, toggleEquiparItem, setItemEditandoId, setEfeitosTempArsenal, setEfeitosTempPassivosArsenal]);

    const deletarItem = useCallback((id) => {
        if (!window.confirm('Deseja destruir este equipamento permanentemente?')) return;
        updateFicha((ficha) => {
            ficha.inventario = (ficha.inventario || []).filter(i => i.id !== id);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const salvarFormaItem = useCallback((itemId, forma) => {
        updateFicha((ficha) => {
            const item = (ficha.inventario || []).find(i => i.id === itemId);
            if (!item) return;
            if (!item.formas) item.formas = [];
            const ix = item.formas.findIndex(f => f.id === forma.id);
            if (ix !== -1) {
                item.formas[ix] = forma;
            } else {
                item.formas.push(forma);
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const deletarFormaItem = useCallback((itemId, formaId) => {
        updateFicha((ficha) => {
            const item = (ficha.inventario || []).find(i => i.id === itemId);
            if (!item) return;
            item.formas = (item.formas || []).filter(f => f.id !== formaId);
            if (item.formaAtivaId === formaId) {
                item.formaAtivaId = null;
                item.configAtivaId = null;
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const ativarFormaItem = useCallback((itemId, formaId, configId = null) => {
        updateFicha((ficha) => {
            const item = (ficha.inventario || []).find(i => i.id === itemId);
            if (!item) return;
            const oldM = capturarMaximosAtuais(ficha);

            item.formaAtivaId = formaId;
            item.configAtivaId = configId;

            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const inventario = minhaFicha?.inventario || [];

    const value = useMemo(() => ({
        nomeItem, setNomeItem,
        tipoItem, setTipoItem,
        bonusTipo, setBonusTipo,
        bonusValor, setBonusValor,
        armaDadosQtd, setArmaDadosQtd,
        armaDadosFaces, setArmaDadosFaces,
        armaAlcance, setArmaAlcance,
        armaTipo, setArmaTipo,
        raridade, setRaridade,
        nomeEfeito, setNomeEfeito,
        novoAtr, setNovoAtr,
        novoProp, setNovoProp,
        novoVal, setNovoVal,
        nomeEfeitoPassivo, setNomeEfeitoPassivo,
        novoAtrPassivo, setNovoAtrPassivo,
        novoPropPassivo, setNovoPropPassivo,
        novoValPassivo, setNovoValPassivo,
        formRef,
        itemEditandoId,
        efeitosTempArsenal,
        efeitosTempPassivosArsenal,
        inventario,
        addEfeitoTemp,
        removerEfeitoTemp,
        addEfeitoPassivoTemp,
        removerEfeitoPassivoTemp,
        salvarNovoItem,
        editarItem,
        cancelarEdicaoItem,
        toggleEquiparItem,
        deletarItem,
        salvarFormaItem,
        deletarFormaItem,
        ativarFormaItem,
    }), [
        nomeItem, tipoItem, bonusTipo, bonusValor,
        armaDadosQtd, armaDadosFaces, armaAlcance, armaTipo, raridade,
        nomeEfeito, novoAtr, novoProp, novoVal,
        nomeEfeitoPassivo, novoAtrPassivo, novoPropPassivo, novoValPassivo,
        itemEditandoId, efeitosTempArsenal, efeitosTempPassivosArsenal, inventario,
        addEfeitoTemp, removerEfeitoTemp, addEfeitoPassivoTemp, removerEfeitoPassivoTemp,
        salvarNovoItem, editarItem, cancelarEdicaoItem, toggleEquiparItem,
        deletarItem, salvarFormaItem, deletarFormaItem, ativarFormaItem,
    ]);

    return (
        <ArsenalFormContext.Provider value={value}>
            {children}
        </ArsenalFormContext.Provider>
    );
}
