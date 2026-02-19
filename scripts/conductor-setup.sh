yarn install
yarn postinstall
cp $CONDUCTOR_ROOT_PATH/.env .env
cp $CONDUCTOR_ROOT_PATH/workers/.dev.vars workers/.dev.vars
cp -r $CONDUCTOR_ROOT_PATH/workers/.wrangler/ workers/.wrangler/
