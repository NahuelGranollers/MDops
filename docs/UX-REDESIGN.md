# Rediseño UX Operativo

## Diagnostico

La UI anterior funcionaba, pero repartia la atencion entre panel, agenda, disponibilidad, avisos y ajustes. Para una operativa diaria de bolos, eso obligaba a pensar demasiado antes de responder la pregunta principal: que hay, cuando es y quien va.

Problemas detectados:

- Navegacion lateral demasiado presente para una app cuyo centro debe ser la agenda.
- Dashboard con KPIs visibles antes que el calendario.
- Filtros y estados siempre visibles aunque no se usen en cada alta.
- Alta de bolo sin flujo primario real.
- Detalle de bolo basado en cards/lista, no en contexto.
- Usuarios y admins compartian demasiada estructura visual.

## Clasificacion

- Esencial siempre visible: agenda, fecha, vista dia/semana/lista, busqueda rapida, nuevo bolo, hora, local, ciudad, personas.
- Visible solo en contexto: detalle del bolo, duplicar, cancelar, disponibilidad del equipo, rol por persona.
- Avanzado oculto: hotel, notas internas, etiquetas, auditoria, adjuntos, zona horaria, modo de conflicto.
- Eliminar de flujo diario: KPIs permanentes, menu lateral grande, filtros extensos por defecto, tablas densas.

## Nueva Navegacion

- `/events`: home real. Agenda operativa para admin y agenda personal para usuario.
- `/availability`: solo cuando se necesita marcar o resolver indisponibilidad.
- `/notifications`: avisos.
- `/settings`: discreto en menu de perfil, no en la navegacion principal movil.

## Jerarquia De Pantalla

Admin:

1. Cabecera compacta.
2. Selector fecha + busqueda + vista + Nuevo bolo.
3. Calendario/agenda.
4. Drawer contextual de detalle o alta rapida.

Usuario:

1. Mis bolos.
2. Fecha/hora/local/direccion/logistica minima.
3. Disponibilidad en pantalla separada.

## Cambios Implementados

- `AppShell` pasa de sidebar a cabecera compacta.
- `Dashboard` redirige a `Events`.
- `Events` usa `OpsAgenda`.
- `OpsAgenda` incluye agenda dia/semana/lista, quick create, selector simple de personas y detalle en sheet.
- `Availability` se simplifica a una accion principal: marcar no disponible.
- `Settings` separa operativa y avanzado.

## Responsive

- Escritorio: calendario semanal dominante y sheet lateral.
- Movil: agenda en columnas apiladas, bottom nav compacta y sheet inferior.

## Atajos

- `N`: nuevo bolo.
- `/`: enfocar busqueda.

## Segunda Pasada: Fluidez Y Calidad Percibida

Fricciones detectadas tras el primer rediseño:

- Las acciones de red no tenian feedback suficiente mas alla de cambiar texto.
- La carga inicial podia parecer vacia en lugar de estar cargando.
- La seleccion de personas era rapida, pero no permitia resolver la logistica individual.
- El backend soportaba logistica global, pero no overrides por asignacion.
- Los estados hover/focus/active no formaban todavia un lenguaje de interaccion consistente.

Principios aplicados:

- Cada accion responde visualmente en menos de 200 ms.
- Los drawers y cambios de vista tienen transiciones cortas.
- Los guardados usan loading pequeño, no bloquean toda la pantalla y muestran toast.
- La agenda usa skeletons para mantener layout estable.
- La seleccion de personal es optimista e inmediata.
- La logistica individual hereda defaults del bolo y solo se expande cuando la persona esta asignada.
- `prefers-reduced-motion` queda respetado.

Modelo de datos ampliado:

- `EventAssignment.travelMode`
- `EventAssignment.usesVan`
- `EventAssignment.departureAt`
- `EventAssignment.arrivalAt`
- `EventAssignment.logisticsNotes`

Copy de feedback:

- Exito guardado: `Bolo guardado`
- Error guardado: `No se ha podido guardar`
- Duplicado: `Bolo duplicado`
- Cancelacion: `Bolo cancelado`

Motion system:

- `--fast`: 120 ms para hover/active/focus.
- `--medium`: 180 ms para drawer, toast y cambios visibles.
- Easing: `cubic-bezier(.2, .8, .2, 1)`.
