import { ref, get, update } from 'firebase/database';
import { db } from './firebase-config';
import { sanitizarNome } from '../stores/useStore';
import { ehChaveDePreferencia, limparPreferenciasRemotas } from '../core/preferencias';

// ==========================================
// 💾 Preferências da conta em `usuarios/{nome}/preferencias` (mesmo nó `usuarios` do histórico de mesas).
// Devolve null se não foi possível ler (sem banco, sem permissão, offline): nesse caso o app segue só com o localStorage.
// ==========================================

const caminho = (nome) => `usuarios/${sanitizarNome(nome)}/preferencias`;

export async function lerPreferenciasDaConta(nome) {
    if (!db || !nome) return null;
    try {
        const snap = await get(ref(db, caminho(nome)));
        return snap.exists() ? limparPreferenciasRemotas(snap.val()) : {};
    } catch (e) { return null; }
}

// Grava só o que mudou neste aparelho (`mudadas`) e apaga `removidas`: assim outro aparelho que alterou OUTRAS chaves não é sobrescrito.
export async function gravarPreferenciasDaConta(nome, mudadas, removidas = []) {
    if (!db || !nome) return false;
    const alteracoes = { ...limparPreferenciasRemotas(mudadas) };
    (removidas || []).forEach(k => { if (ehChaveDePreferencia(k)) alteracoes[k] = null; });
    if (Object.keys(alteracoes).length === 0) return true;
    try { await update(ref(db, caminho(nome)), alteracoes); return true; } catch (e) { return false; }
}
