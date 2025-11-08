# Local Setup

In order to contribute, you'll need a minimum of [**LaTeX**](https://en.wikipedia.org/wiki/LaTeX) distribution, Inkscape ang git.
Please read the instructions for your operating system (or container).

=== "Windows"

    ### Windows

    #### Install required software

    Download and install the following:

     - [**MiKTeX**](https://miktex.org/) - a LaTeX distribution for Windows

     - [**Inkscape**](https://inkscape.org/) - download the `.exe` installer, not `.msi`!. While installing tick `Add Inkscape to the System Path` option. Inkscape won't work otherwise.

     - [**git**](https://git-scm.com/) to commit files to the repository

     - [**Perl**](https://www.perl.org/get.html) - download the Strawberry Perl binary release.

    Optionally, to edit the TeX files conveniently:

     - [**VSCode**](https://code.visualstudio.com/Download) with [**TeX Workshop extension**](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop), or

     - [**TeXstudio**](https://www.texstudio.org/), or

     - [**TeXworks**](https://www.tug.org/texworks/)

    #### GitHub Account

    If you don't have an account on GitHub, please [create one](https://github.com/signup) now.

    #### Fork and clone the repository

    In the Mission Book's [GitHub repository](https://github.com/qwrtln/Homm3BG-mission-book), click "Fork":

    ![fork](assets/fork.png)

    Go to your repositories in GitHub, open the forked Mission Book repository, click the green "Code" button, and copy the clone URL:

    ![fork](assets/clone.png)

    Open the git program you installed.
    Run this command:

    ```bash
    git clone <copied_url>
    ```

    A new directory titled `Homm3bg-mission-book` should appear now in your file explorer.

    #### Building the project

    In the git bash console, run this command (see the [**build script**](scripts.md#buildsh) for details):

    ```bash
    tools/build.sh -d
    ```

    This will build the draft scenarios book.
    If the build is successful, you are all set to start working on your scenario.

=== "MacOS"
    ### MacOS

    You can install everything using Homebrew:

    ```bash
    brew install mactex inkscape perl
    ```

    Fork the repository and clone it.
    To build the project, it's best to use the script (see the [**build script**](scripts.md#buildsh) for details):

    ```bash
    tools/build.sh -d
    ```

    For building a single scenario (the `-s` flag, useful if you're working on one), you also need newer versions of `bash` and `grep` than the ones MacOS ships with:

    ```bash
    brew install bash grep
    ```

    Then, you can use the script like this (see [**best practices**](scenarios.md#best-practices) for details):

    ```bash
    tools/build.sh -s 'my scenario'
    ```

    To work on localizations, make screenshots, optimize PDFs, etc., you will need some additional tools:
    ```bash
    brew install poppler po4a ghostscript imagemagick
    ```

=== "Linux"
    ### Linux

    Install a `texlive` distribution, `inkscape`, and `perl` using your package manager.

    Fork and clone the repo.
    To build the project, it's best to use the script (see the [**build script**](scripts.md#buildsh) for details):

    ```bash
    tools/build.sh -d
    ```

    To work on localizations, make screenshots, optimize PDFs, etc., you will need some additional tools:

    - po4a
    - poppler-utils
    - ghostscript
    - imagemagick

=== "Container"
    ### Container

    There is also a [**container**](container.md) available, which contains all the necessary tools.
