// Declares this package's Android native module to @react-native-community/cli
// autolinking. Explicit (rather than relying on auto-detection) so the Kotlin
// ReactPackage is registered deterministically. Android-only: there is no iOS half.
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.symbiote.android.SymbioteAndroidPackage;',
        packageInstance: 'new SymbioteAndroidPackage()',
      },
      ios: null,
    },
  },
};
