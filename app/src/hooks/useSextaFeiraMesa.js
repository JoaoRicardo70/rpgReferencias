import { useEffect, useRef } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../services/firebase-config';
import useStore, { loreCapitulosPresentePadrao, loreCapitulosFuturoPadrao } from '../stores/useStore';
import { normalizarRegistros } from '../core/sextaFeira';

// 🤖 SEXTA-FEIRA NA MESA — montado uma vez no App.
//  - Config (mesas/{mesaId}/sextaFeira/config): chave do Gemini + modelo, cadastrados pelo Mestre.
//  - Registros Akáshicos (mesas/{mesaId}/sextaFeira/registros): antes viviam só no navegador de
//    cada um. Agora são da mesa: todos recebem, só Mestre/Co-Mestre gravam (com debounce).
//    Se a mesa ainda não tem Registros, o primeiro Mestre que abrir sobe os que tem no navegador.
//    Antes de trocar os Registros locais pelos da mesa, uma cópia de segurança dos locais fica
//    em localStorage (rpgSextaFeira_backupLocal), sem nunca ser sobrescrita.

const DEBOUNCE_REGISTROS_MS = 800;
const CHAVE_BACKUP_LOCAL = 'rpgSextaFeira_backupLocal';

function caminhoRegistros(mesaId) { return `mesas/${mesaId}/sextaFeira/registros`; }

function serializarRegistros(presente, futuro) {
    return JSON.stringify({ presente, futuro });
}

function guardarBackupLocalUmaVez() {
    try {
        if (localStorage.getItem(CHAVE_BACKUP_LOCAL)) return;
        const presente = localStorage.getItem('rpgSextaFeira_capitulos');
        const futuro = localStorage.getItem('rpgSextaFeira_capitulosFuturo');
        if (!presente && !futuro) return;
        localStorage.setItem(CHAVE_BACKUP_LOCAL, JSON.stringify({ salvoEm: Date.now(), presente, futuro }));
    } catch (e) { /* sem localStorage: segue sem backup */ }
}

export default function useSextaFeiraMesa() {
    const mesaId = useStore(s => s.mesaId);
    const isMestre = useStore(s => s.isMestre);
    const setSextaFeiraConfig = useStore(s => s.setSextaFeiraConfig);
    const setRegistrosCompartilhados = useStore(s => s.setRegistrosCompartilhados);
    const aplicarRegistrosRemotos = useStore(s => s.aplicarRegistrosRemotos);

    // Último estado dos Registros que veio do Firebase (ou que foi gravado lá), serializado —
    // evita regravar o que acabou de chegar (eco) e decide quando subir a versão local.
    const ultimoRemotoRef = useRef(null);
    const remotoCarregadoRef = useRef(false);
    const agendarEnvioRef = useRef(null);
    // De qual mesa são os Registros que estão no store agora. null = ainda são os do navegador
    // (localStorage); só esses podem ser subidos pra uma mesa que ainda não tem Registros.
    const loreOrigemRef = useRef(null);
    // Gravação recusada (ex.: regras do banco): o banco desfaz o valor local e o listener
    // dispara de novo; sem esta trava, o reenvio automático ficaria em laço. Edições de verdade
    // do Mestre continuam tentando.
    const falhouGravarRef = useRef(false);

    useEffect(() => {
        if (!mesaId || !db) { setSextaFeiraConfig(null); return undefined; }
        const unsub = onValue(
            ref(db, `mesas/${mesaId}/sextaFeira/config`),
            (snap) => setSextaFeiraConfig(snap.val() || null),
            () => setSextaFeiraConfig(null),
        );
        return () => { unsub(); setSextaFeiraConfig(null); };
    }, [mesaId, setSextaFeiraConfig]);

    useEffect(() => {
        remotoCarregadoRef.current = false;
        ultimoRemotoRef.current = null;
        setRegistrosCompartilhados(false);
        if (!mesaId || !db) return undefined;
        const unsub = onValue(ref(db, caminhoRegistros(mesaId)), (snap) => {
            remotoCarregadoRef.current = true;
            const normalizado = normalizarRegistros(snap.val());
            if (!normalizado) {
                setRegistrosCompartilhados(false);
                if (loreOrigemRef.current && loreOrigemRef.current !== mesaId) {
                    // O store ainda tem os Registros de OUTRA mesa: nunca os copia pra esta.
                    // Começa dos padrões; a primeira edição do Mestre cria os Registros daqui.
                    ultimoRemotoRef.current = serializarRegistros(loreCapitulosPresentePadrao, loreCapitulosFuturoPadrao);
                    aplicarRegistrosRemotos({ presente: loreCapitulosPresentePadrao, futuro: loreCapitulosFuturoPadrao });
                    loreOrigemRef.current = mesaId;
                    return;
                }
                // Mesa sem Registros (ou apagados): o Mestre sobe os que tem aqui.
                ultimoRemotoRef.current = null;
                if (agendarEnvioRef.current && !falhouGravarRef.current) agendarEnvioRef.current();
                return;
            }
            guardarBackupLocalUmaVez();
            const presente = normalizado.presente.length ? normalizado.presente : loreCapitulosPresentePadrao;
            const futuro = normalizado.futuro.length ? normalizado.futuro : loreCapitulosFuturoPadrao;
            ultimoRemotoRef.current = serializarRegistros(presente, futuro);
            aplicarRegistrosRemotos({ presente, futuro });
            loreOrigemRef.current = mesaId;
            setRegistrosCompartilhados(true);
        });
        return () => unsub();
    }, [mesaId, setRegistrosCompartilhados, aplicarRegistrosRemotos]);

    useEffect(() => {
        if (!mesaId || !isMestre || !db) { agendarEnvioRef.current = null; return undefined; }
        let timer = null;

        const gravarAgora = () => {
            timer = null;
            const s = useStore.getState();
            const json = serializarRegistros(s.loreCapitulosPresente, s.loreCapitulosFuturo);
            if (json === ultimoRemotoRef.current) return;
            const anterior = ultimoRemotoRef.current;
            const falhou = (err) => {
                // Libera uma nova tentativa na próxima edição.
                if (ultimoRemotoRef.current === json) ultimoRemotoRef.current = anterior;
                falhouGravarRef.current = true;
                console.error('[Sexta-Feira] Falha ao salvar os Registros na mesa:', err);
            };
            ultimoRemotoRef.current = json;
            loreOrigemRef.current = mesaId;
            try {
                // JSON.parse(json) descarta campos undefined, que o Realtime Database recusa.
                set(ref(db, caminhoRegistros(mesaId)), {
                    ...JSON.parse(json),
                    atualizadoEm: Date.now(),
                    atualizadoPor: s.meuNome || '',
                }).then(() => { falhouGravarRef.current = false; }).catch(falhou);
            } catch (err) { falhou(err); }
        };

        const agendarEnvio = () => {
            if (!remotoCarregadoRef.current) return;
            const s = useStore.getState();
            if (serializarRegistros(s.loreCapitulosPresente, s.loreCapitulosFuturo) === ultimoRemotoRef.current) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(gravarAgora, DEBOUNCE_REGISTROS_MS);
        };
        agendarEnvioRef.current = agendarEnvio;
        agendarEnvio();

        const unsub = useStore.subscribe((estado, anterior) => {
            if (estado.loreCapitulosPresente !== anterior.loreCapitulosPresente || estado.loreCapitulosFuturo !== anterior.loreCapitulosFuturo) agendarEnvio();
        });
        return () => {
            unsub();
            agendarEnvioRef.current = null;
            if (!timer) return;
            clearTimeout(timer);
            // Não perde a última edição ao sair da aba/app, mas nunca grava depois de deixar de
            // ser Mestre nem na mesa errada (isMestre chega atrasado ao trocar de mesa).
            const s = useStore.getState();
            if (s.isMestre && s.mesaId === mesaId) gravarAgora();
        };
    }, [mesaId, isMestre]);
}
