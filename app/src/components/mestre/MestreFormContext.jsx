import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { enviarParaFeed, salvarDummie, apagarFicha } from '../../services/firebase-sync';
import { getMaximo } from '../../core/attributes';
import { calcularCA } from '../../core/engine';
import { getVitalMax, getVitalMaxEstavel, getTetoVida } from '../../core/vitals';
import { calcularFatorMultiplicadorForca } from '../../core/poder';
import { ref, set, remove } from 'firebase/database';
import { db } from '../../services/firebase-config'; 

const MestreFormContext = createContext(null);

export function useMestreForm() {
    const ctx = useContext(MestreFormContext);
    if (!ctx) return null;
    return ctx;
}

export function MestreFormProvider({ children }) {
    const personagens = useStore(s => s.personagens);
    const isMestre = useStore(s => s.isMestre);
    const meuNome = useStore(s => s.meuNome);

    // Puxa as informações da Sala para o sistema de Patentes
    const mesaId = useStore(s => s.mesaId);
    const mesaCriador = useStore(s => s.mesaCriador);
    const mesaMestres = useStore(s => s.mesaMestres) || {};

    const [msgSistema, setMsgSistema] = useState('');
    const [dNome, setDNome] = useState('Goblin Espiao');
    const [dHp, setDHp] = useState(100);
    const [dVit, setDVit] = useState(0);
    const [dDefTipo, setDDefTipo] = useState('evasiva');
    const [dDef, setDDef] = useState(10);
    const [dVisivelHp, setDVisivelHp] = useState('todos');
    const [dOculto, setDOculto] = useState(false);

    const enviarAviso = useCallback(() => {
        if (!msgSistema.trim()) return;
        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: msgSistema.trim() });
        setMsgSistema('');
    }, [msgSistema]);

    const injetarDummie = useCallback(() => {
        const hBase = parseInt(dHp) || 100;
        const vit = parseInt(dVit) || 0;
        const h = hBase * Math.pow(10, vit);
        const dv = parseInt(dDef) || 10;
        const id = 'dummie_' + Date.now();

        salvarDummie(id, {
            nome: dNome,
            hpMax: h,
            hpAtual: h,
            tipoDefesa: dDefTipo,
            valorDefesa: dv,
            visibilidadeHp: dVisivelHp,
            oculto: dOculto,
            posicao: { x: 0, y: 0 }
        });

        alert(`${dNome} injetado no mapa! ${dOculto ? '(Invisivel)' : ''}`);
    }, [dNome, dHp, dVit, dDef, dDefTipo, dVisivelHp, dOculto]);

    const handleApagarJogador = useCallback((nome) => {
        if (nome === meuNome) {
            alert('Nao pode apagar-se a si mesmo enquanto Mestre!');
            return;
        }
        if (window.confirm(`TEM A CERTEZA QUE QUER APAGAR A FICHA DE ${nome.toUpperCase()} DA BASE DE DADOS? ESTA ACAO E IRREVERSIVEL!`)) {
            apagarFicha(nome);
        }
    }, [meuNome]);

    // 🔥 NOVA FUNÇÃO RESTAURADA: NOMEAR CO-MESTRES 🔥
    const toggleCoMestre = useCallback(async (nomeAmigo) => {
        if (meuNome !== mesaCriador) return alert("Apenas o Mestre Supremo (Dono da Sala) pode nomear Co-Mestres.");
        if (nomeAmigo === mesaCriador) return alert("Esta pessoa já é o Dono da mesa!");
        
        // 🔥 CORREÇÃO: isMestre é decidido em App.jsx > iniciarListenerMestres, que lê
        // "index_mesas/{mesaId}/mestres" com a chave gerada por sanitizarNome() -- esta função
        // gravava em "mesas/{mesaId}/mestres" (árvore errada, de dados do JOGO, não de metadados
        // da mesa) usando uma sanitização PRÓPRIA (toLowerCase + remover tudo que não for a-z0-9),
        // diferente de sanitizarNome() (só troca ".#$[]/" e dá trim, preserva maiúsculas/acentos).
        // As duas falhas juntas faziam a promoção "funcionar" (sem erro, alerta de sucesso) sem
        // NUNCA conceder permissão de Mestre de verdade -- a segunda falha sozinha já quebraria
        // qualquer nome com maiúscula, acento ou espaço, mesmo com o caminho certo.
        const nickSanitizado = sanitizarNome(nomeAmigo);
        const mestreRef = ref(db, `index_mesas/${mesaId}/mestres/${nickSanitizado}`);
        
        try {
            if (mesaMestres[nickSanitizado]) {
                await remove(mestreRef);
                alert(`${nomeAmigo} foi rebaixado a Jogador comum.`);
            } else {
                await set(mestreRef, true);
                alert(`${nomeAmigo} foi promovido a Co-Mestre!`);
            }
        } catch (err) {
            console.error("Erro ao alterar Co-Mestre", err);
            alert("Erro de permissão. Apenas o Dono da sala tem acesso a esta função no Firebase.");
        }
    }, [mesaId, mesaCriador, mesaMestres, meuNome]);

    const jogadoresList = useMemo(() => Object.entries(personagens || {}), [personagens]);

    const fmt = useCallback((n) => Number(n || 0).toLocaleString('pt-BR'), []);

    const jogadoresComStats = useMemo(() => {
        return jogadoresList.map(([nome, ficha]) => {
            // 🩸 getTetoVida já está na mesma escala/unidade que ficha.vida.atual (a "única fonte
            // de verdade" também usada pela Ficha/Regeneração) e já é o TOTAL real de Vida (nunca
            // inflado além do bruto, mesmo com várias Break Bars) — getMaximo(ficha,'vida') sozinho
            // é o valor BRUTO com Formas, unidade diferente de "atual", o que fazia percHp ficar
            // perto de 0% pra qualquer personagem de alto Poder.
            //
            // 🩹 SINCRONIA COM A FICHA/MAPA (pedido do usuário): a Ficha Definitiva multiplica o
            // teto de Vida pelo "Multiplicador de Força" daquele vital ANTES de decidir escala/nº
            // de barras (ver core/poder.js > calcularFatorMultiplicadorForca) — sem isso aqui, o
            // MESMO personagem mostrava um Máximo de Vida diferente no card do Mestre.
            const fatorVida = calcularFatorMultiplicadorForca(ficha, 'vida');
            const hpMax = getTetoVida(getVitalMax('vida', ficha) * fatorVida, 'vida', getVitalMaxEstavel('vida', ficha) * fatorVida);
            const hpAtual = ficha.vida?.atual ?? hpMax;
            const percHp = hpMax > 0 ? (hpAtual / hpMax) * 100 : 0;
            const mpMax = getMaximo(ficha, 'mana');
            const mpAtual = ficha.mana?.atual ?? mpMax;

            let classId = ficha?.bio?.classe;
            if ((classId === 'pretender' || classId === 'alterego') && ficha?.bio?.subClasse) classId = ficha?.bio?.subClasse;

            const evasiva = calcularCA(ficha, 'evasiva');
            const resistencia = calcularCA(ficha, 'resistencia');

            return { nome, ficha, hpMax, hpAtual, percHp, mpMax, mpAtual, classId, evasiva, resistencia };
        });
    }, [jogadoresList]);

    const value = useMemo(() => ({
        isMestre,
        meuNome,
        mesaCriador,
        mesaMestres,
        msgSistema, setMsgSistema,
        dNome, setDNome,
        dHp, setDHp,
        dVit, setDVit,
        dDefTipo, setDDefTipo,
        dDef, setDDef,
        dVisivelHp, setDVisivelHp,
        dOculto, setDOculto,
        enviarAviso,
        injetarDummie,
        handleApagarJogador,
        toggleCoMestre, // Exporta a função de promover!
        jogadoresList,
        jogadoresComStats,
        fmt,
    }), [
        isMestre, meuNome, mesaCriador, mesaMestres,
        msgSistema, dNome, dHp, dVit, dDefTipo, dDef, dVisivelHp, dOculto,
        enviarAviso, injetarDummie, handleApagarJogador, toggleCoMestre,
        jogadoresList, jogadoresComStats, fmt,
    ]);

    return (
        <MestreFormContext.Provider value={value}>
            {children}
        </MestreFormContext.Provider>
    );
}