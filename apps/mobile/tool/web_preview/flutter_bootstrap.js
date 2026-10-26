{{flutter_js}}
{{flutter_build_config}}

// Draw into #app (index.html) so a wide screen gets a phone-sized frame.
_flutter.loader.load({
  onEntrypointLoaded: async (engineInitializer) => {
    const appRunner = await engineInitializer.initializeEngine({
      hostElement: document.querySelector('#app'),
    });
    await appRunner.runApp();
  },
});
