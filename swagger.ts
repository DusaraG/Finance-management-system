import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Finance Management System API',
            version: '1.0.0',
            description: 'API documentation for Finance Management System',
        },
        servers: [
            {
                url: 'http://localhost:3000',
            },
        ],
    },
    apis: ['./routes/*.ts'], // Path to the API docs
};

const specs = swaggerJsdoc(options);

export default (app: any) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
};
