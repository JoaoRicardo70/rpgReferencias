import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { carregarFichaDoFirebase, salvarFichaSilencioso, salvarFirebaseImediato, uploadImagem } from '../../services/firebase-sync';
import { auth } from '../../services/firebase-config';

const PerfilFormContext = createContext(null);

export function usePerfilForm() {
    const ctx = useContext(PerfilFormContext);
    if (!ctx) return null;
    return ctx;
}

export function PerfilFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const meuNome = useStore(s => s.meuNome);
    const setMeuNome = useStore(s => s.setMeuNome);
    const isMestre = useStore(s => s.isMestre);
    const setIsMestre = useStore(s => s.setIsMestre);
    const resetFicha = useStore(s => s.resetFicha);
    const carregarDadosFicha = useStore(s => s.carregarDadosFicha);
    const setPersonagemParaDeletar = useStore(s => s.setPersonagemParaDeletar);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const mesaId = useStore(s => s.mesaId);
    const personagensDB = useStore(s => s.personagens);

    const [nomeInput, setNomeInput] = useState(meuNome || '');
    const [uploadingImg, setUploadingImg] = useState(false);

    // ==========================================
    // 🛡️ NÚCLEO DE IDENTIDADE IMUTÁVEL (Sobrevive ao F5 e Electron)
    // ==========================================
    const [contaId, setContaId] = useState(null);
    useEffect(() => {
        const unsub = auth.onAuthStateChanged(u => {
            if (u && u.email) setContaId(sanitizarNome(u.email.split('@')[0]));
            else setContaId(null);
        });
        return () => unsub();
    }, []);

    // ==========================================
    // 📡 LEITURA DIRETA E ABSOLUTA DO BANCO DE DADOS
    // 🔥 Reaproveita o listener único já mantido pelo useFirebase (evita assinatura duplicada no Firebase)
    // ==========================================

    // ==========================================
    // 🧠 A LISTA INTELIGENTE (Cruza a Tabela com a sua Identidade)
    // ==========================================
    const listaLocal = useMemo(() => {
        if (!contaId) return [];
        const meusNomes = new Set();

        // 1. Puxa TODOS os personagens da Nuvem que tenham a sua Assinatura
        Object.entries(personagensDB).forEach(([nome, ficha]) => {
            if (ficha.donoDaFicha === contaId) meusNomes.add(nome);
        });

        // 2. Traz de volta os seus personagens que só estão na sua Memória Local e que faltam ser carimbados
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('rpgFicha_')) meusNomes.add(k.replace('rpgFicha_', ''));
        }

        return Array.from(meusNomes).sort();
    }, [personagensDB, contaId]);

    useEffect(() => { setNomeInput(meuNome || ''); }, [meuNome]);

    // ==========================================
    // ⚡ O CARREGADOR E CARIMBADOR AUTOMÁTICO
    // ==========================================
    const processarCarregamento = useCallback(async (nomeCru) => {
        const n = sanitizarNome(nomeCru);
        if (!n || (n === 'Jogador' && nomeCru.trim() === '')) return;
        
        setMeuNome(n); 
        localStorage.setItem('rpgNome', n); 
        resetFicha();

        let precisaSalvarCarimbo = false;
        let dadosFinais = null;

        // 1. Busca Direto na Tabela do Firebase
        const dadosNuven = await carregarFichaDoFirebase(n);
        
        if (dadosNuven && Object.keys(dadosNuven).length > 2) {
            dadosFinais = dadosNuven;
            // Se o personagem existe na nuvem mas ainda não tem a sua assinatura, ELE GANHA!
            if (contaId && dadosFinais.donoDaFicha !== contaId) {
                dadosFinais.donoDaFicha = contaId;
                precisaSalvarCarimbo = true;
            }
        } else {
            // 2. Se não estava na nuvem, busca no seu PC
            const bl = localStorage.getItem('rpgFicha_' + n);
            if (bl) {
                try {
                    dadosFinais = JSON.parse(bl);
                    if (contaId && dadosFinais.donoDaFicha !== contaId) {
                        dadosFinais.donoDaFicha = contaId;
                        precisaSalvarCarimbo = true;
                    }
                } catch (e) {}
            }
        }

        if (dadosFinais) {
            carregarDadosFicha(dadosFinais);
            localStorage.setItem('rpgFicha_' + n, JSON.stringify(dadosFinais));
        } else {
            // 3. É um Personagem Novo! Já ganha o Carimbo da sua Conta.
            updateFicha(f => { f.donoDaFicha = contaId; });
            precisaSalvarCarimbo = true;
        }

        // Força a atualização no banco de dados para marcar território
        if (precisaSalvarCarimbo) {
            setTimeout(() => {
                if (typeof salvarFirebaseImediato === 'function') salvarFirebaseImediato();
                else salvarFichaSilencioso();
            }, 500);
        }
        
        setAbaAtiva('aba-ficha');
    }, [setMeuNome, resetFicha, carregarDadosFicha, setAbaAtiva, contaId, updateFicha]);

    const trocarPersonagem = useCallback(() => processarCarregamento(nomeInput), [nomeInput, processarCarregamento]);
    const carregarPersonagemExistente = useCallback((n) => { setNomeInput(n); processarCarregamento(n); }, [processarCarregamento]);
    const abrirModalDelete = useCallback((n) => setPersonagemParaDeletar(n), [setPersonagemParaDeletar]);

    const toggleMestre = useCallback(() => {
        const novoVal = !isMestre;
        setIsMestre(novoVal); localStorage.setItem('rpgIsMestre', novoVal ? 'sim' : 'nao');
    }, [isMestre, setIsMestre]);

    const alterarAvatarBase = useCallback((e) => {
        updateFicha(ficha => { if (!ficha.avatar) ficha.avatar = { base: "" }; ficha.avatar.base = e.target.value; });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const handleImageUpload = useCallback(async (e) => {
        const file = e.target.files[0]; if (!file) return;
        setUploadingImg(true);
        try {
            const url = await uploadImagem(file, `avatars/${meuNome || 'desconhecido'}`);
            updateFicha(ficha => { if (!ficha.avatar) ficha.avatar = { base: "" }; ficha.avatar.base = url; });
            await salvarFirebaseImediato();
        } catch (err) { alert('Erro ao sincronizar o avatar!'); } 
        finally { setUploadingImg(false); }
    }, [meuNome, updateFicha]);

    const value = useMemo(() => ({ minhaFicha, meuNome, isMestre, nomeInput, setNomeInput, listaLocal, uploadingImg, trocarPersonagem, carregarPersonagemExistente, abrirModalDelete, toggleMestre, alterarAvatarBase, handleImageUpload }), [ minhaFicha, meuNome, isMestre, nomeInput, listaLocal, uploadingImg, trocarPersonagem, carregarPersonagemExistente, abrirModalDelete, toggleMestre, alterarAvatarBase, handleImageUpload ]);
    return <PerfilFormContext.Provider value={value}>{children}</PerfilFormContext.Provider>;
}