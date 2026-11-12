/*
 * core/contexts — el contenido del generador de enunciados (spec f3c-enunciados, plan P1 y P3): los cuatro
 * contextos (reformar una vivienda, lanzar un producto, organizar un congreso y mudar un laboratorio).
 *
 * Es contenido docente aprobado por el autor, como los enunciados de core/statements: vive en el núcleo para que el
 * generador, las pruebas y el banco de Moodle usen exactamente el mismo texto en Node y en el navegador. Cada
 * actividad del catálogo es [etapa, infinitivo ES, infinitivo EN, gerundio EN]. La etapa (1–6) es la del proceso:
 * el generador reparte los nombres de modo que ninguna precedencia vaya de una etapa a otra anterior (orden
 * verosímil). Los nombres van en minúscula; el generador pone la mayúscula donde toca. Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const DAYS = { one: { es: 'día', en: 'day' }, many: { es: 'días', en: 'days' } };
  const WEEKS = { one: { es: 'semana', en: 'week' }, many: { es: 'semanas', en: 'weeks' } };

  const CONTEXTS = {
    home: {
      title: { es: 'Reformar una vivienda', en: 'Refurbishing a flat' },
      intro: { es: 'Marta y Luis van a reformar su piso. Han apuntado lo que hay que hacer y cuántos días lleva cada tarea.',
        en: 'Marta and Luis are going to refurbish their flat. They have written down what needs doing and how many days each task takes.' },
      unit: DAYS,
      resource: { es: 'el mismo encargado de obra', en: 'the same site foreman' },
      acts: [
        [1, 'pedir la licencia de obra', 'apply for the building permit', 'applying for the building permit'],
        [1, 'vaciar los muebles', 'clear out the furniture', 'clearing out the furniture'],
        [1, 'contratar a los gremios', 'hire the tradespeople', 'hiring the tradespeople'],
        [1, 'encargar los materiales', 'order the materials', 'ordering the materials'],
        [2, 'derribar los tabiques', 'knock down the partition walls', 'knocking down the partition walls'],
        [2, 'levantar el suelo viejo', 'take up the old floor', 'taking up the old floor'],
        [2, 'desmontar la cocina', 'strip out the kitchen', 'stripping out the kitchen'],
        [2, 'quitar los sanitarios', 'remove the bathroom fittings', 'removing the bathroom fittings'],
        [3, 'renovar la instalación eléctrica', 'rewire the flat', 'rewiring the flat'],
        [3, 'cambiar las tuberías', 'replace the pipes', 'replacing the pipes'],
        [3, 'levantar los tabiques nuevos', 'put up the new partitions', 'putting up the new partitions'],
        [3, 'cambiar las ventanas', 'replace the windows', 'replacing the windows'],
        [4, 'enlucir las paredes', 'plaster the walls', 'plastering the walls'],
        [4, 'colocar el suelo nuevo', 'lay the new floor', 'laying the new floor'],
        [4, 'alicatar el baño', 'tile the bathroom', 'tiling the bathroom'],
        [4, 'instalar la calefacción', 'install the heating', 'installing the heating'],
        [5, 'pintar las paredes', 'paint the walls', 'painting the walls'],
        [5, 'montar la cocina', 'fit the kitchen', 'fitting the kitchen'],
        [5, 'colocar las puertas', 'hang the doors', 'hanging the doors'],
        [6, 'limpiar la obra', 'clean up the site', 'cleaning up the site'],
        [6, 'devolver los muebles a su sitio', 'move the furniture back', 'moving the furniture back'],
        [6, 'revisar la obra con la arquitecta', 'go round the work with the architect', 'going round the work with the architect'],
      ],
    },
    product: {
      title: { es: 'Lanzar un producto', en: 'Launching a product' },
      intro: { es: 'Una pequeña empresa quiere lanzar un producto nuevo. Su equipo ha estimado en semanas la duración de cada tarea.',
        en: 'A small company wants to launch a new product. Its team has estimated how many weeks each task takes.' },
      unit: WEEKS,
      resource: { es: 'la misma sala de reuniones', en: 'the same meeting room' },
      acts: [
        [1, 'estudiar el mercado', 'study the market', 'studying the market'],
        [1, 'definir el producto', 'define the product', 'defining the product'],
        [1, 'fijar el presupuesto', 'set the budget', 'setting the budget'],
        [1, 'elegir a los proveedores', 'choose the suppliers', 'choosing the suppliers'],
        [2, 'diseñar el prototipo', 'design the prototype', 'designing the prototype'],
        [2, 'registrar la marca', 'register the trademark', 'registering the trademark'],
        [2, 'diseñar el envase', 'design the packaging', 'designing the packaging'],
        [2, 'preparar el plan de marketing', 'draw up the marketing plan', 'drawing up the marketing plan'],
        [3, 'fabricar el prototipo', 'build the prototype', 'building the prototype'],
        [3, 'probar el prototipo con usuarios', 'test the prototype with users', 'testing the prototype with users'],
        [3, 'negociar con los distribuidores', 'negotiate with the distributors', 'negotiating with the distributors'],
        [3, 'crear la web del producto', 'build the product website', 'building the product website'],
        [4, 'ajustar el diseño', 'refine the design', 'refining the design'],
        [4, 'certificar el producto', 'certify the product', 'certifying the product'],
        [4, 'preparar la línea de producción', 'set up the production line', 'setting up the production line'],
        [5, 'fabricar la primera serie', 'make the first batch', 'making the first batch'],
        [5, 'grabar el anuncio', 'shoot the advert', 'shooting the advert'],
        [5, 'formar al equipo de ventas', 'train the sales team', 'training the sales team'],
        [6, 'distribuir el producto a las tiendas', 'ship the product to the shops', 'shipping the product to the shops'],
        [6, 'presentar el producto a la prensa', 'present the product to the press', 'presenting the product to the press'],
        [6, 'lanzar la campaña en redes sociales', 'launch the social media campaign', 'launching the social media campaign'],
      ],
    },
    congress: {
      title: { es: 'Organizar un congreso', en: 'Organising a conference' },
      intro: { es: 'Un grupo de investigación organiza un congreso internacional. Ha calculado en semanas lo que lleva cada tarea.',
        en: 'A research group is organising an international conference. It has worked out how many weeks each task takes.' },
      unit: WEEKS,
      resource: { es: 'la misma persona de la secretaría', en: 'the same person from the secretariat' },
      acts: [
        [1, 'elegir la fecha y la sede', 'choose the date and the venue', 'choosing the date and the venue'],
        [1, 'formar el comité científico', 'form the scientific committee', 'forming the scientific committee'],
        [1, 'buscar patrocinadores', 'look for sponsors', 'looking for sponsors'],
        [1, 'pedir una subvención', 'apply for a grant', 'applying for a grant'],
        [2, 'reservar la sede', 'book the venue', 'booking the venue'],
        [2, 'publicar la convocatoria', 'publish the call for papers', 'publishing the call for papers'],
        [2, 'crear la web del congreso', 'set up the conference website', 'setting up the conference website'],
        [2, 'invitar a los ponentes principales', 'invite the keynote speakers', 'inviting the keynote speakers'],
        [3, 'recibir los trabajos', 'collect the submissions', 'collecting the submissions'],
        [3, 'abrir las inscripciones', 'open registration', 'opening registration'],
        [3, 'reservar los hoteles', 'book the hotels', 'booking the hotels'],
        [3, 'contratar el catering', 'hire the caterers', 'hiring the caterers'],
        [4, 'evaluar los trabajos', 'review the submissions', 'reviewing the submissions'],
        [4, 'preparar el programa', 'draw up the programme', 'drawing up the programme'],
        [4, 'diseñar los carteles', 'design the posters', 'designing the posters'],
        [5, 'imprimir el libro de resúmenes', 'print the book of abstracts', 'printing the book of abstracts'],
        [5, 'preparar las acreditaciones', 'prepare the badges', 'preparing the badges'],
        [5, 'montar las salas', 'set up the rooms', 'setting up the rooms'],
        [6, 'celebrar el congreso', 'hold the conference', 'holding the conference'],
        [6, 'publicar las actas', 'publish the proceedings', 'publishing the proceedings'],
        [6, 'enviar los certificados de asistencia', 'send out the attendance certificates', 'sending out the attendance certificates'],
      ],
    },
    lab: {
      title: { es: 'Mudar un laboratorio', en: 'Moving a laboratory' },
      intro: { es: 'Un laboratorio de la universidad se traslada a un edificio nuevo. Su responsable ha estimado en días lo que lleva cada tarea.',
        en: 'A university laboratory is moving to a new building. Its manager has estimated how many days each task takes.' },
      unit: DAYS,
      resource: { es: 'el mismo técnico', en: 'the same technician' },
      acts: [
        [1, 'inventariar el equipo', 'take an inventory of the equipment', 'taking an inventory of the equipment'],
        [1, 'contratar la empresa de mudanzas', 'hire the removal firm', 'hiring the removal firm'],
        [1, 'revisar el laboratorio nuevo', 'inspect the new laboratory', 'inspecting the new laboratory'],
        [1, 'avisar a los proveedores', 'notify the suppliers', 'notifying the suppliers'],
        [2, 'cerrar los experimentos en curso', 'wrap up the ongoing experiments', 'wrapping up the ongoing experiments'],
        [2, 'pedir cajas y material de embalaje', 'order boxes and packing material', 'ordering boxes and packing material'],
        [2, 'adaptar la instalación eléctrica del laboratorio nuevo', 'adapt the power supply in the new laboratory', 'adapting the power supply in the new laboratory'],
        [2, 'hacer una copia de seguridad de los datos', 'back up the data', 'backing up the data'],
        [3, 'embalar el material de vidrio', 'pack the glassware', 'packing the glassware'],
        [3, 'desconectar los equipos', 'disconnect the instruments', 'disconnecting the instruments'],
        [3, 'retirar los reactivos peligrosos', 'remove the hazardous chemicals', 'removing the hazardous chemicals'],
        [3, 'instalar las campanas extractoras', 'install the fume hoods', 'installing the fume hoods'],
        [4, 'transportar los equipos', 'transport the instruments', 'transporting the instruments'],
        [4, 'trasladar las muestras congeladas', 'move the frozen samples', 'moving the frozen samples'],
        [4, 'montar el mobiliario del laboratorio nuevo', 'set up the furniture in the new laboratory', 'setting up the furniture in the new laboratory'],
        [5, 'conectar los equipos', 'connect the instruments', 'connecting the instruments'],
        [5, 'desembalar el material', 'unpack the material', 'unpacking the material'],
        [5, 'colocar el material de vidrio', 'put away the glassware', 'putting away the glassware'],
        [6, 'calibrar los equipos', 'calibrate the instruments', 'calibrating the instruments'],
        [6, 'revisar la seguridad del laboratorio', 'carry out the safety inspection', 'carrying out the safety inspection'],
        [6, 'reanudar los experimentos', 'resume the experiments', 'resuming the experiments'],
      ],
    },
  };

  const api = { KEYS: Object.keys(CONTEXTS), CONTEXTS };
  root.PNL = root.PNL || {};
  root.PNL.contexts = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
