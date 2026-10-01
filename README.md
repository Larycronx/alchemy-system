# Sistema de Alquimia

Módulo de alquimia para **Foundry VTT v13** com o sistema **D&D 5e**. Permite descobrir receitas, consumir ingredientes, fabricar poções e venenos, registrar histórico e administrar receitas pelo painel do Mestre.

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-8b5cf6)
![D&D 5e](https://img.shields.io/badge/D%26D%205e-supported-ef4444)
![Idioma](https://img.shields.io/badge/idioma-pt--BR-16a34a)

## Recursos

- Receitas de poções, venenos e itens alquímicos.
- Experimentação com dois ou três ingredientes.
- Conhecimento individual por personagem e descoberta automática.
- Testes de alquimia com perícias, atributos ou fórmulas.
- Consumo de ingredientes com restauração compensatória em caso de erro.
- Histórico de fabricação, favoritos, anotações e progressão alquímica.
- Painel do Mestre para editar, importar, exportar e distribuir receitas.
- Integração opcional com Midi-QOL.
- Interface em português do Brasil, com temas claro, escuro e pergaminho.

## Compatibilidade

| Componente | Versão |
| --- | --- |
| Foundry VTT | v13 |
| Sistema D&D 5e | 4.0.0 ou superior compatível com v13 |
| Midi-QOL | Opcional |

## Instalação

1. Baixe ou clone este repositório em `FoundryData/Data/modules/alchemy-system`.
2. Confirme que o arquivo `module.json` está diretamente nessa pasta.
3. Reinicie o Foundry VTT.
4. No mundo D&D 5e, abra **Gerenciar Módulos** e ative **Sistema de Alquimia**.

O identificador da pasta precisa ser `alchemy-system`.

## Ingredientes

O módulo possui **36 ingredientes alquímicos** na biblioteca interna, incluindo:

- Erva Vermelha, Folha Amarga, Flor Lunar e Raiz Entorpecente.
- Cogumelo Azul, Esporo Sonífero, Cristal Elemental e Cristal de Quartzo.
- Pó de Diamante, Pó de Esmeralda, Escama de Dragão e Pena de Águia.
- Olho de Basilisco e Casca de Basilisco.
- Núcleo Ácido, Faísca Elétrica, Essência Energética, Cinza Ígnea e Geada Elemental.
- Fragmento Necrótico, Cristal Psíquico, Pó Radiante, Núcleo Trovejante e Antitoxina Concentrada.
- Essência Mágica, Essência de Sombra, Água Purificada e Água de Fonte Feérica.
- Álcool Alquímico, Óleo Estabilizador, Glândula Tóxica e venenos raros.

### Criar os ingredientes

O macro [macros/create-alchemy-ingredients.js](macros/create-alchemy-ingredients.js) cria ou atualiza todos os ingredientes no mundo ou em um compêndio de itens.

#### Tutorial: criar no compêndio

1. Abra o arquivo [macros/create-alchemy-ingredients.js](macros/create-alchemy-ingredients.js) e copie todo o conteúdo.
2. No Foundry, abra **Macros** e crie um macro do tipo **Script**.
3. Cole o conteúdo e confirme que estas opções estão configuradas:

```js
const DESTINO = "compendium";
const COMPENDIUM_COLLECTION = "";
const QUANTIDADE_INICIAL = 3;
const ATUALIZAR_EXISTENTES = true;
```

4. Execute o macro como Mestre.
5. Se `COMPENDIUM_COLLECTION` estiver vazio, selecione o compêndio na janela exibida.
6. Se quiser abrir um compêndio específico sem perguntar, informe sua collection:

```js
const COMPENDIUM_COLLECTION = "world.alchemy-ingredients";
```

Substitua `world.alchemy-ingredients` pelo identificador exibido na lista de compêndios. O compêndio precisa ser de **Itens** e estar desbloqueado para escrita.

O macro cria ou atualiza os **36 ingredientes**, evita duplicatas pelo nome e aplica a flag `alchemy-system.ingredient`. Ao concluir, o Foundry exibirá quantos itens foram criados e atualizados.

Os itens recebem a flag `alchemy-system.ingredient`, quantidade inicial e propriedades alquímicas. O macro evita duplicatas e atualiza flags de itens existentes.

## Fabricação e compêndio D&D 5e

As receitas mapeadas usam os itens reais do pack `dnd5e.items` como origem. Quando uma poção é fabricada, o módulo copia para o inventário do ator:

- descrição original;
- imagem;
- tipo e dados do item;
- efeitos e configurações do D&D 5e;
- identificação da origem em `flags.core.sourceId`.

Isso cria uma cópia mundial do documento do compêndio, que é o comportamento normal do Foundry VTT. A receita de exemplo **Poção de Cura Superior** usa o UUID `Compendium.dnd5e.items.Item.5m9ErO9In8Uc5yyf`.

Se uma receita configurada com UUID ou aliases não encontrar o item no compêndio, a fabricação é interrompida com uma mensagem clara em vez de criar um item genérico.

## Uso rápido

O jogador pode abrir a interface pelo botão do módulo ou pela API:

```js
game.modules.get("alchemy-system").api.open();
```

O Mestre pode abrir o painel administrativo com:

```js
game.modules.get("alchemy-system").api.openGM();
```

Para fabricar, o personagem precisa conhecer a receita, possuir os ingredientes na quantidade necessária e, quando configurado, ter o equipamento exigido, como **Kit de Alquimia**.

## Configurações

As configurações mundiais permitem controlar:

- conhecimento individual e descoberta automática;
- experimentação e resultado de combinações desconhecidas;
- consumo de ingredientes em sucesso ou falha;
- testes, falhas e resultados parciais;
- exigência de equipamentos;
- visibilidade das mensagens no chat;
- tema da interface e limites de histórico.

## Atualização de receitas

O módulo mantém um `schemaVersion` e migra receitas salvas no mundo. Ao atualizar, entre no mundo como Mestre para que os novos aliases e UUIDs de compêndio sejam aplicados às receitas existentes.

## Desenvolvimento e validação

O projeto não usa processo de build nem dependências externas. Para validar a instalação local:

```powershell
node tools/validate.mjs
node tools/regression.mjs
```

A validação verifica JSON, manifesto, imports, sintaxe JavaScript, cobertura dos 36 ingredientes e correspondência do inventário.

## Estrutura

```text
assets/       Ícones SVG
lang/         Traduções
macros/       Macros do Foundry
scripts/      Lógica, dados, interface e integração
styles/       Estilos
templates/    Templates Handlebars
tools/        Validação e regressão
```

## Contribuição

Contribuições são bem-vindas. Abra uma issue para relatar problemas ou envie um pull request com uma descrição clara da mudança e dos testes executados.

## Licença

Consulte [LICENSE](LICENSE).

## Links

- [Foundry VTT](https://foundryvtt.com/)
- [Sistema D&D 5e](https://foundryvtt.com/packages/dnd5e/)
- [Repositório do projeto](https://github.com/Larycronx/alchemy-system)
