import React from 'react';
import { MestreFormProvider, useMestreForm } from './MestreFormContext';
import {
    MestreAcessoNegado,
    MestreVisorJogadores,
    MestreVozSistema,
    MestreForjaNPC
} from './MestreSubComponents';
import MestreControleTurno from './MestreControleTurno';
import EquipesRelacoes from './EquipesRelacoes';
import RacasCatalogo from './RacasCatalogo';
import BibliotecaRacialMestre from './BibliotecaRacialMestre';
import MestreSegurarAcao from './MestreSegurarAcao';
import SubAbasMestre, { SecaoMestreAncora } from './SubAbasMestre';
import { MestreNotificacoesPedidos } from './MestrePedidosSexta';

function MestreConteudoSeguro() {
    const ctx = useMestreForm();
    if (!ctx) return null;
    if (!ctx.isMestre) return <MestreAcessoNegado />;

    const paineis = {
        combate: (
            <>
                {/* Controle de Turnos do combate (mesma ação do "Passar Turno" do Mapa) */}
                <SecaoMestreAncora id="turnos"><MestreControleTurno /></SecaoMestreAncora>
                {/* 🛡️ Equipes nomeadas, relações entre elas e quem está em qual lado */}
                <EquipesRelacoes />
                {/* ⏳ Quantas Ações cada um pode segurar (Hold Action) */}
                <SecaoMestreAncora id="segurar"><MestreSegurarAcao /></SecaoMestreAncora>
            </>
        ),
        // 🧬 Catálogo de Raças da mesa, quem é de qual raça e Pedidos de Raça
        racas: (
            <>
                <RacasCatalogo />
                {/* 📚 Biblioteca de Habilidades de Raça (publicar uma vez, conceder a cada personagem da Raça) */}
                <BibliotecaRacialMestre />
            </>
        ),
        entidades: (
            <div className="mestre-entidades-linha">
                <SecaoMestreAncora id="jogadores" className="mestre-secao-ancora--visor"><MestreVisorJogadores /></SecaoMestreAncora>
                <div className="mestre-entidades-lateral">
                    <MestreVozSistema />
                </div>
            </div>
        ),
        // 💀 Forja de Entidades (Boss & NPCs)
        forja: <SecaoMestreAncora id="forja"><MestreForjaNPC /></SecaoMestreAncora>,
    };

    return (
        <div className="mestre-painel-pagina">
            <h2 className="mestre-painel-titulo">👑 DOMÍNIO DO MESTRE</h2>

            {/* 🔔 Pedidos de criação feitos pelos jogadores à Sexta-Feira (visíveis em qualquer sub-aba) */}
            <SecaoMestreAncora id="pedidos"><MestreNotificacoesPedidos /></SecaoMestreAncora>

            {/* 🧭 Sub-abas: Combate, Raças, Entidades e Forja */}
            <SubAbasMestre paineis={paineis} />
        </div>
    );
}

export default function MestrePanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0
    return (
        <MestreFormProvider>
            <div className={className}>
                {hasChildren ? children : <MestreConteudoSeguro />}
            </div>
        </MestreFormProvider>
    );
}
