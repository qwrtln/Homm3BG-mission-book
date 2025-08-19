FROM alpine:latest AS po4a-builder

ARG PO4A_VERSION=0.74
ENV PO4A_GH_URL=https://github.com/mquinson/po4a/releases/download

RUN apk add --no-cache wget && \
    wget --quiet ${PO4A_GH_URL}/v${PO4A_VERSION}/po4a-${PO4A_VERSION}.tar.gz && \
    mkdir -p /po4a && \
    tar -xf po4a-${PO4A_VERSION}.tar.gz -C /po4a --strip-components=1 && \
    rm po4a-${PO4A_VERSION}.tar.gz && \
    apk del --purge wget

FROM alpine:latest

COPY --from=po4a-builder /po4a /opt/po4a

COPY texlive.profile /
COPY texlive_pgp_keys.asc /

RUN <<EOF
  set -ex
  apk --no-cache add \
    bash \
    curl \
    delta \
    diffutils \
    fontconfig \
    gettext \
    gettext-dev \
    ghostscript \
    git \
    gnupg \
    grep \
    imagemagick \
    inkscape \
    less \
    make \
    ncurses \
    perl \
    perl-dev \
    perl-unicode-linebreak \
    perl-yaml \
    poppler-utils \
    tar \
    wget \
    xz

  [[ -f /usr/bin/locale ]] || ln -s /usr/bin/gettext /usr/bin/locale

  apk add --no-cache --virtual .build-deps \
      build-base \
      perl-app-cpanminus

  CFLAGS="-I/usr/include" LIBS="-L/usr/lib -lintl" cpanm --no-wget Locale::gettext
  cpanm --no-wget Text::WrapI18N
  cpanm --no-wget Term::ReadKey
  cpanm --no-wget Pod::Parser
  cpanm --no-wget YAML::Tiny
  cpanm --no-wget Unicode::GCString
  cpanm --no-wget Syntax::Keyword::Try
  cpanm --no-wget Encode::Locale

  apk del .build-deps
  rm -rf /var/cache/apk/* /var/tmp/* /root/.cpanm

  mkdir -p /tmp/install-tl
  cd /tmp/install-tl
  MIRROR_URL="$(curl -fsS -w "%{redirect_url}" -o /dev/null https://mirror.ctan.org/)"
  echo "Using mirror: ${MIRROR_URL}"
  curl -fsSOL "${MIRROR_URL}systems/texlive/tlnet/install-tl-unx.tar.gz"
  curl -fsSOL "${MIRROR_URL}systems/texlive/tlnet/install-tl-unx.tar.gz.sha512"
  curl -fsSOL "${MIRROR_URL}systems/texlive/tlnet/install-tl-unx.tar.gz.sha512.asc"
  gpg --import /texlive_pgp_keys.asc
  gpg --verify ./install-tl-unx.tar.gz.sha512.asc ./install-tl-unx.tar.gz.sha512
  sha512sum -c ./install-tl-unx.tar.gz.sha512
  mkdir -p /tmp/install-tl/installer
  tar --strip-components 1 -zxf /tmp/install-tl/install-tl-unx.tar.gz -C /tmp/install-tl/installer
  /tmp/install-tl/installer/install-tl --profile=/texlive.profile
  /opt/texlive/texdir/bin/*/tlmgr install \
    adjustbox \
    bigfoot \
    catchfile \
    changepage \
    collection-binextra \
    collection-fontsrecommended \
    collection-latex \
    collection-langcyrillic \
    collection-latexrecommended \
    collection-pictures \
    enumitem \
    etexcmds \
    footmisc \
    fullwidth \
    imakeidx \
    listings  \
    listingsutf8  \
    luabidi \
    multirow \
    nth \
    oberdiek \
    outlines \
    paracol \
    pdfcol \
    placeins \
    soul \
    sttools \
    svg \
    tcolorbox \
    titlesec \
    tocloft \
    tools \
    transparent \
    varwidth \
    wrapfig \
    xstring \
    zref
  /opt/texlive/texdir/bin/*/tlmgr path add
  /opt/texlive/texdir/bin/*/mktexlsr
  mkdir -p /etc/fonts/conf.d
  ln -s /opt/texlive/texdir/texmf-var/fonts/conf/texlive-fontconfig.conf /etc/fonts/conf.d/09-texlive.conf
  fc-cache -fv
  mkdir -p /root/.texlive*/texmf-var /root/texmf-var/luatex-cache/generic /root/texmf-var/fonts/cache
  chmod -R 777 /root/.texlive* /root/texmf-var
  chmod -R 777 /opt/texlive/texdir/texmf-var
  /opt/texlive/texdir/bin/*/luaotfload-tool --update --force
  apk del --purge \
    wget \
    tar \
    make \
    xz \
    gnupg
  rm -rf \
    /root/.gnupg \
    /root/.wget-hsts \
    /usr/share/man/* \
    /usr/share/doc/* \
    /var/cache/apk/* \
    /var/tmp/* \
    /opt/texlive/texdir/install-tl \
    /opt/texlive/texdir/install-tl.log \
    /opt/texlive/texdir/texmf-dist/doc \
    /opt/texlive/texdir/texmf-dist/source \
    /opt/texlive/texdir/texmf-var/web2c/tlmgr.log \
    /opt/texlive/texdir/bin/*/etex \
    /texlive.profile \
    /texlive_pgp_keys.asc \
    /tmp/install-tl
  cd /
  git config --global --add safe.directory /data
  echo 'alias build="tools/build.sh"' >> /root/.bashrc
  echo 'alias scrshot="tools/pdf2image.sh"' >> /root/.bashrc
  echo 'alias cpo4a="tools/po4a_commit.sh"' >> /root/.bashrc
EOF

WORKDIR /data

ENV PATH="/opt/texlive/texdir/bin/x86_64-linuxmusl:/opt/po4a:${PATH}" \
    PERL5LIB="/opt/po4a/lib" \
    TERM=xterm-256color

CMD ["/bin/bash"]
